// Only manages newly opened browser WINDOWS, never profiles or page contents.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;
class BrowserBridge {
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
 delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f,IntPtr p);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int t,uint f);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a,bool b,uint p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr p,int f,StringBuilder s,ref int n);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static readonly Dictionary<string,string> Sites=new Dictionary<string,string>{{"chatgpt","https://chatgpt.com/"},{"claude","https://claude.ai/new"},{"gemini","https://gemini.google.com/app"}};
 static readonly Dictionary<string,string> Browsers=new Dictionary<string,string>();
 class Entry {public IntPtr H;public string Browser,Exe;public Rect Original;public uint Pid;}
 static readonly Dictionary<string,Entry> Windows=new Dictionary<string,Entry>();
 static IntPtr Office;static uint OfficePid;
 static string Str(Dictionary<string,object> q,string k){return q.ContainsKey(k)?Convert.ToString(q[k]):"";}
 static int Num(Dictionary<string,object> q,string k){return q.ContainsKey(k)?Convert.ToInt32(q[k]):0;}
 static bool Yes(Dictionary<string,object> q,string k){return q.ContainsKey(k)&&q[k] is bool&&(bool)q[k];}
 static string Image(IntPtr h){uint pid;GetWindowThreadProcessId(h,out pid);IntPtr p=OpenProcess(0x1000,false,pid);if(p==IntPtr.Zero)return "";try{var s=new StringBuilder(32768);int n=s.Capacity;return QueryFullProcessImageName(p,0,s,ref n)?s.ToString():"";}finally{CloseHandle(p);}}
 static bool Valid(Entry e){uint p;return IsWindow(e.H)&&GetWindowThreadProcessId(e.H,out p)!=0&&p==e.Pid&&String.Equals(Image(e.H),e.Exe,StringComparison.OrdinalIgnoreCase);}
 static string Title(IntPtr h){var s=new StringBuilder(512);GetWindowText(h,s,s.Capacity);return s.ToString();}
 static List<IntPtr> Enumerate(string exe){var a=new List<IntPtr>();EnumWindows(delegate(IntPtr h,IntPtr p){var s=new StringBuilder(128);GetClassName(h,s,s.Capacity);if(s.ToString()=="Chrome_WidgetWin_1"&&String.Equals(Image(h),exe,StringComparison.OrdinalIgnoreCase))a.Add(h);return true;},IntPtr.Zero);return a;}
 static void FindBrowser(string id,string name,string tail){var paths=new List<string>();foreach(var hive in new[]{Registry.CurrentUser,Registry.LocalMachine})try{using(var k=hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\"+name)){if(k!=null)paths.Add(Convert.ToString(k.GetValue(null)));}}catch{}foreach(string env in new[]{"PROGRAMFILES","PROGRAMFILES(X86)","LOCALAPPDATA"}){string p=Environment.GetEnvironmentVariable(env);if(!String.IsNullOrEmpty(p))paths.Add(Path.Combine(p,tail));}foreach(string p in paths)if(!String.IsNullOrWhiteSpace(p)){string clean=p.Trim().Trim('"');if(File.Exists(clean)&&String.Equals(Path.GetFileName(clean),name,StringComparison.OrdinalIgnoreCase)){Browsers[id]=Path.GetFullPath(clean);return;}}}
 static void CheckOffice(){uint p;if(!IsWindow(Office)||GetWindowThreadProcessId(Office,out p)==0||p!=OfficePid)throw new Exception("오피스 창을 확인할 수 없습니다.");}
 static void Release(string id,bool restore){Entry e;if(!Windows.TryGetValue(id,out e))return;Windows.Remove(id);if(!Valid(e))return;if(IsIconic(e.H))ShowWindow(e.H,9);else ShowWindow(e.H,4);if(restore&&!IsZoomed(e.H))SetWindowPos(e.H,IntPtr.Zero,e.Original.Left,e.Original.Top,Math.Max(640,e.Original.Right-e.Original.Left),Math.Max(480,e.Original.Bottom-e.Original.Top),0x14);}
 static object Snapshot(){var data=new Dictionary<string,object>();foreach(var pair in new List<KeyValuePair<string,Entry>>(Windows)){var e=pair.Value;if(!Valid(e)){Windows.Remove(pair.Key);continue;}Rect r;GetWindowRect(e.H,out r);data[pair.Key]=new{hwnd=e.H.ToInt64().ToString(),browser=e.Browser,pid=e.Pid,visible=IsWindowVisible(e.H),minimized=IsIconic(e.H),title=Title(e.H),rect=new{x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top}};}return data;}
 static object Handle(Dictionary<string,object> q){string action=Str(q,"action"),id=Str(q,"provider");
  if(action=="list")return new{browsers=new List<string>(Browsers.Keys),windows=Snapshot()};
  if(action=="state")return Snapshot();
  if(action=="release-all"){foreach(string key in new List<string>(Windows.Keys))Release(key,true);return Snapshot();}
  if(action=="detach"){Release(id,true);return Snapshot();}
  CheckOffice();
  if(action=="open"){
   string browser=Str(q,"browser"),exe;if(!Sites.ContainsKey(id)||!Browsers.TryGetValue(browser,out exe))throw new Exception("Chrome 또는 Edge 설치를 확인해 주세요.");
   Entry existing;if(Windows.TryGetValue(id,out existing)){if(Valid(existing)&&existing.Browser==browser){ShowWindow(existing.H,9);SetForegroundWindow(existing.H);return Snapshot();}Release(id,true);}
   var before=new HashSet<IntPtr>(Enumerate(exe));
   // Ordinary user browser; no debugging, profile, UA or security overrides.
   var info=new ProcessStartInfo(exe,"--new-window \""+Sites[id]+"\""){UseShellExecute=true};
   Process launched=Process.Start(info);IntPtr h=IntPtr.Zero;DateTime limit=DateTime.UtcNow.AddSeconds(25);
   while(DateTime.UtcNow<limit){var found=Enumerate(exe).FindAll(w=>!before.Contains(w)&&IsWindowVisible(w));if(found.Count==1){h=found[0];break;}if(found.Count>1)throw new Exception("여러 브라우저 창이 함께 열려 위치를 연결하지 못했습니다. 열린 웹사이트는 일반 브라우저로 사용할 수 있습니다.");Thread.Sleep(100);}
   if(launched!=null)launched.Dispose();if(h==IntPtr.Zero)throw new Exception("브라우저는 열었지만 새 창을 찾지 못했습니다. 브라우저의 프로필 선택을 마친 뒤 다시 열어 주세요.");
   Rect original;GetWindowRect(h,out original);uint pid;GetWindowThreadProcessId(h,out pid);Windows[id]=new Entry{H=h,Browser=browser,Exe=exe,Original=original,Pid=pid};
   if(IsZoomed(h)||IsIconic(h))ShowWindow(h,9);SetForegroundWindow(h);return Snapshot();
  }
  if(action=="sync"){
   int x=Num(q,"x"),y=Num(q,"y"),w=Num(q,"width"),height=Num(q,"height");bool visible=Yes(q,"visible")&&!IsIconic(Office)&&IsWindowVisible(Office);
   if(Math.Abs((long)x)>100000||Math.Abs((long)y)>100000||w<0||w>20000||height<0||height>20000)throw new Exception("잘못된 창 위치입니다.");
   foreach(var pair in new List<KeyValuePair<string,Entry>>(Windows)){var e=pair.Value;if(!Valid(e)){Windows.Remove(pair.Key);continue;}
    if(visible&&pair.Key==id&&w>=450&&height>=250){
     // Retain normal frame/address bar. No SetParent or owner changes.
     if(IsIconic(e.H)||IsZoomed(e.H))ShowWindow(e.H,9);if(!IsWindowVisible(e.H))ShowWindow(e.H,4);
     SetWindowPos(e.H,IntPtr.Zero,x,y,w,height,0x14);IntPtr fg=GetForegroundWindow();if(Yes(q,"raise")&&(fg==Office||fg==e.H))SetWindowPos(e.H,IntPtr.Zero,0,0,0,0,0x13);
    }else if(IsWindowVisible(e.H))ShowWindow(e.H,0);
   }return Snapshot();
  }throw new Exception("지원하지 않는 브라우저 명령입니다.");
 }
 public static int Main(string[] args){Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);try{try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}Office=new IntPtr(Int64.Parse(args[0]));OfficePid=UInt32.Parse(args[1]);FindBrowser("chrome","chrome.exe",@"Google\Chrome\Application\chrome.exe");FindBrowser("edge","msedge.exe",@"Microsoft\Edge\Application\msedge.exe");string line;while((line=Console.ReadLine())!=null){object seq=null;try{if(line.Length>20000)throw new Exception("Invalid message");var q=Json.Deserialize<Dictionary<string,object>>(line);q.TryGetValue("id",out seq);var result=Handle(q);Console.WriteLine(Json.Serialize(new{id=seq,ok=true,result=result}));}catch(Exception ex){Console.WriteLine(Json.Serialize(new{id=seq,ok=false,error=ex.Message}));}}return 0;}catch{return 1;}finally{foreach(string id in new List<string>(Windows.Keys))try{Release(id,true);}catch{}}}
}
