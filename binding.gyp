{
  "variables": {
    "openssl_fips": ""
  },
  "targets": [
    {
      "target_name": "os_service",
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags_cc": [
        "-std=c++20"
      ],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
        "OTHER_CFLAGS": [
          "-std=c++20"
        ]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [
            "/std:c++20"
          ]
        }
      },
      "conditions": [
        [
          "OS==\"win\"",
          {
            "libraries": [
              "advapi32.lib"
            ],
            "sources": [
              "src/service.cc",
              "src/pthread.cc"
            ]
          }
        ]
      ]
    }
  ]
}
