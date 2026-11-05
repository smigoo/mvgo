/**
 * doc-analysis.json Schema（JS 模块形式 — 避免构建同步漏 .json）
 */
module.exports = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "doc-analysis.json — 文档六维分析产物（Schema 固定、内容自由）",
  "type": "object",
  "required": [
    "docHash",
    "analyzedAt",
    "dimensions"
  ],
  "properties": {
    "docHash": {
      "type": "string",
      "minLength": 16
    },
    "analyzedAt": {
      "type": "string"
    },
    "source": {
      "type": "string",
      "enum": [
        "upload",
        "paste",
        "file"
      ]
    },
    "trustLevel": {
      "type": "string",
      "enum": [
        "highest",
        "normal"
      ]
    },
    "moduleInfo": {
      "type": "object",
      "properties": {
        "moduleCode": {
          "type": "string"
        },
        "moduleName": {
          "type": "string"
        },
        "targetUser": {
          "type": "string"
        },
        "dataSource": {
          "type": "string"
        }
      }
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "eventId"
        ],
        "properties": {
          "eventId": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "payload": {
            "type": "object"
          },
          "confidence": {
            "type": "string",
            "enum": [
              "high",
              "medium",
              "low"
            ]
          },
          "inferred": {
            "type": "boolean"
          }
        }
      }
    },
    "statuses": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "statusId"
        ],
        "properties": {
          "statusId": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "params": {
            "type": "object"
          },
          "confidence": {
            "type": "string"
          },
          "inferred": {
            "type": "boolean"
          }
        }
      }
    },
    "dataBinding": {
      "type": "object",
      "properties": {
        "apis": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "apiCode"
            ],
            "properties": {
              "apiCode": {
                "type": "string"
              },
              "endpoint": {
                "type": "string"
              },
              "method": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "params": {
                "type": "array"
              },
              "responseSchema": {
                "type": "object"
              },
              "responseExample": {
                "type": "object"
              }
            }
          }
        },
        "fieldMappings": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "element"
            ],
            "properties": {
              "element": {
                "type": "string"
              },
              "control": {
                "type": "string"
              },
              "field": {
                "type": "string"
              },
              "api": {
                "type": "string"
              },
              "condition": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "businessConfig": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "key"
        ]
      }
    },
    "cssVariableConfig": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "key"
        ]
      }
    },
    "onloadFlow": {
      "type": "object",
      "properties": {
        "initCalls": {
          "type": "array"
        },
        "firstRender": {
          "type": "array"
        },
        "polling": {
          "type": "object"
        }
      }
    },
    "uiElements": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "name"
        ],
        "properties": {
          "seq": {
            "type": [
              "number",
              "string"
            ]
          },
          "name": {
            "type": "string"
          },
          "control": {
            "type": "string"
          },
          "field": {
            "type": "string"
          },
          "note": {
            "type": "string"
          },
          "conditional": {
            "type": "boolean"
          }
        }
      }
    },
    "interactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "trigger": {
            "type": "string"
          },
          "behavior": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "target": {
            "type": "string"
          }
        }
      }
    },
    "dimensions": {
      "type": "object",
      "required": [
        "events",
        "dataBinding",
        "config",
        "onload",
        "ui",
        "interactions"
      ],
      "properties": {
        "events": {
          "type": "boolean"
        },
        "dataBinding": {
          "type": "boolean"
        },
        "config": {
          "type": "boolean"
        },
        "onload": {
          "type": "boolean"
        },
        "ui": {
          "type": "boolean"
        },
        "interactions": {
          "type": "boolean"
        }
      }
    },
    "sectionHashes": {
      "type": "object"
    },
    "extractionMeta": {
      "type": "object"
    }
  }
}
