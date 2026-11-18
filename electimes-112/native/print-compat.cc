// Electimes Office: keep legacy printer property sheets in one DPI context.
// Only this process's PrintDlgExW import is wrapped; rendering, DEVMODE, and the
// document's printer DPI are left to Chromium and the installed driver.
#include <windows.h>
#include <objbase.h>
#include <commdlg.h>
#include <delayimp.h>
#include <node_api.h>
#include <cstring>
#include <atomic>

namespace {
using PrintDialog = HRESULT(WINAPI*)(LPPRINTDLGEXW);
PrintDialog original = nullptr;
std::atomic<unsigned> calls{0}, restored{0};
std::atomic<int> before{-1}, inside{-1}, after{-1};
bool installed = false;
const char* failure = "not-installed";

HRESULT WINAPI CompatiblePrintDialog(LPPRINTDLGEXW options) {
  // GDI scaling supports older drivers which assume 96-DPI dialog templates.
  // The OS then scales the complete top-level dialog and all its controls.
  // Restore immediately when PrintDlgExW returns, including Cancel and failure.
  const auto old = GetThreadDpiAwarenessContext();
  before = static_cast<int>(GetAwarenessFromDpiAwarenessContext(old));
  auto saved = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_UNAWARE_GDISCALED);
  if (!saved) saved = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_UNAWARE);
  inside = static_cast<int>(GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext()));
  ++calls;
  const HRESULT result = original(options);
  if (saved) SetThreadDpiAwarenessContext(saved);
  after = static_cast<int>(GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext()));
  if (AreDpiAwarenessContextsEqual(old, GetThreadDpiAwarenessContext())) ++restored;
  return result;
}

bool ReplaceImport(ULONG_PTR* slot) {
  // Resolve the real DLL entry instead of calling an unresolved delay-load stub.
  // This also avoids recursively entering our wrapper after delay resolution.
  HMODULE library = LoadLibraryExW(L"comdlg32.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (!library) { failure = "system-library"; return false; }
  auto actual = reinterpret_cast<PrintDialog>(GetProcAddress(library, "PrintDlgExW"));
  if (!actual) { failure = "system-function"; return false; }
  DWORD protection;
  if (!VirtualProtect(slot, sizeof(*slot), PAGE_READWRITE, &protection)) {
    failure = "import-protection"; return false;
  }
  original = actual;
  InterlockedExchangePointer(reinterpret_cast<void* volatile*>(slot),
                             reinterpret_cast<void*>(&CompatiblePrintDialog));
  DWORD ignored;
  VirtualProtect(slot, sizeof(*slot), protection, &ignored);
  // Keep both the system DLL and this addon loaded for the process lifetime.
  HMODULE self;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
                    reinterpret_cast<LPCWSTR>(&CompatiblePrintDialog), &self);
  failure = "";
  return true;
}

bool FindFunction(BYTE* base, DWORD namesRva, DWORD slotsRva) {
  if (!namesRva || !slotsRva) return false;
  auto names = reinterpret_cast<IMAGE_THUNK_DATA*>(base + namesRva);
  auto slots = reinterpret_cast<IMAGE_THUNK_DATA*>(base + slotsRva);
  for (size_t i=0; names[i].u1.AddressOfData; ++i) {
    if (IMAGE_SNAP_BY_ORDINAL(names[i].u1.Ordinal)) continue;
    auto entry = reinterpret_cast<IMAGE_IMPORT_BY_NAME*>(base + names[i].u1.AddressOfData);
    if (std::strcmp(reinterpret_cast<char*>(entry->Name), "PrintDlgExW") == 0)
      return ReplaceImport(&slots[i].u1.Function);
  }
  return false;
}

bool InstallImport() {
  auto base = reinterpret_cast<BYTE*>(GetModuleHandleW(nullptr));
  auto dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
  if (dos->e_magic != IMAGE_DOS_SIGNATURE) { failure="pe-dos"; return false; }
  auto nt = reinterpret_cast<IMAGE_NT_HEADERS*>(base + dos->e_lfanew);
  if (nt->Signature != IMAGE_NT_SIGNATURE || nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC) {
    failure="pe-64"; return false;
  }
  // Electron 43.7.6 uses a delay import. Also support a normal import without
  // depending on fixed binary offsets or modifying any instructions on disk.
  auto dir=nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
  if (dir.VirtualAddress) {
    auto table=reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base+dir.VirtualAddress);
    for (size_t i=0; i<dir.Size/sizeof(*table) && table[i].Name; ++i)
      if (_stricmp(reinterpret_cast<char*>(base+table[i].Name),"comdlg32.dll")==0 &&
          FindFunction(base,table[i].OriginalFirstThunk,table[i].FirstThunk)) return true;
  }
  dir=nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT];
  if (dir.VirtualAddress) {
    auto table=reinterpret_cast<ImgDelayDescr*>(base+dir.VirtualAddress);
    for (size_t i=0; i<dir.Size/sizeof(*table) && table[i].rvaDLLName; ++i)
      if ((table[i].grAttrs & dlattrRva) &&
          _stricmp(reinterpret_cast<char*>(base+table[i].rvaDLLName),"comdlg32.dll")==0 &&
          FindFunction(base,table[i].rvaINT,table[i].rvaIAT)) return true;
  }
  if (!*failure || std::strcmp(failure,"not-installed")==0) failure="print-import-not-found";
  return false;
}

void Number(napi_env env,napi_value obj,const char* name,int value) {
  napi_value n;napi_create_int32(env,value,&n);napi_set_named_property(env,obj,name,n);
}
napi_value Status(napi_env env,napi_callback_info) {
  napi_value obj,b,s;napi_create_object(env,&obj);napi_get_boolean(env,installed,&b);
  napi_set_named_property(env,obj,"installed",b);
  napi_create_string_utf8(env,failure,NAPI_AUTO_LENGTH,&s);napi_set_named_property(env,obj,"error",s);
  Number(env,obj,"calls",calls);Number(env,obj,"restored",restored);
  Number(env,obj,"before",before);Number(env,obj,"inside",inside);Number(env,obj,"after",after);
  Number(env,obj,"current",static_cast<int>(GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext())));
  return obj;
}
napi_value Init(napi_env env,napi_value exports) {
  installed=InstallImport();
  napi_value fn;napi_create_function(env,"status",NAPI_AUTO_LENGTH,Status,nullptr,&fn);
  napi_set_named_property(env,exports,"status",fn);return exports;
}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
