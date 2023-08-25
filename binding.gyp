{
  'targets': [
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [
        "<(module_name)"
      ],
      "copies": [
        {
          "files": [
            "<(PRODUCT_DIR)/<(module_name).node"
          ],
          "destination": "<(module_path)"
        }
      ]
    },
    {
      'target_name': 'os_service',
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      'conditions': [
        [
          'OS=="win"',
          {
            'libraries': [
              'advapi32.lib'
            ],
            'sources': [
              'src/service.cc',
              'src/pthread.cc'
            ]
          }
        ]
      ]
    }
  ]
}
