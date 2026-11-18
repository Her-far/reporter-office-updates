{
  "targets": [{
    "target_name": "print_compat",
    "sources": ["print-compat.cc"],
    "defines": ["WIN32_LEAN_AND_MEAN", "NOMINMAX", "NAPI_VERSION=8", "WINVER=0x0A00", "_WIN32_WINNT=0x0A00"],
    "libraries": ["user32.lib"],
    "msvs_settings": {"VCCLCompilerTool": {"AdditionalOptions": ["/std:c++17"], "RuntimeLibrary": 0}}
  }]
}
