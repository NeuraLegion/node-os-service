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
