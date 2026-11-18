{
  "targets": [{
    "target_name": "print_compat",
    "sources": ["print-compat.cc"],
    "defines": ["WIN32_LEAN_AND_MEAN", "NOMINMAX", "NAPI_VERSION=8"],
    "libraries": ["user32.lib"],
    "msvs_settings": {"VCCLCompilerTool": {"AdditionalOptions": ["/std:c++17"], "RuntimeLibrary": 0}}
  }]
}
