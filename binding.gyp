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
      "conditions": [
        [
          "OS==\"mac\"",
          {
            "xcode_settings": {
              "MACOSX_DEPLOYMENT_TARGET": "10.7",
              "OTHER_CFLAGS": [
                "-arch x86_64",
                "-arch arm64"
              ],
              "OTHER_LDFLAGS": [
                "-arch x86_64",
                "-arch arm64"
              ]
            }
          }
        ],
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
