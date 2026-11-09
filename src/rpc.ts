import { Rpc } from "@opencode/plugin/rpc"

// JSON Schema shapes shared by the server implementation and GUI client.
// Every model of every provider uses the same outer shapes, so these are the
// only contracts the plugin needs.

const empty = {
  type: "object",
  properties: {},
  additionalProperties: false,
}

const settings = {
  type: "object",
  properties: {
    stt: {
      type: "object",
      properties: {
        provider: { type: "string" },
        openrouterModel: { type: "string" },
        groqModel: { type: "string" },
        localBaseUrl: { type: "string" },
        localModel: { type: "string" },
        localApiKey: { type: "string" },
        openrouterApiKey: { type: "string" },
        groqApiKey: { type: "string" },
        hasOpenrouterKey: { type: "boolean" },
        hasGroqKey: { type: "boolean" },
        language: { type: "string" },
        prompt: { type: "string" },
        temperature: { type: "number" },
      },
      additionalProperties: false,
    },
    tts: {
      type: "object",
      properties: {
        engine: { type: "string" },
        voice: { type: "string" },
        rate: { type: "number" },
        autoSpeak: { type: "boolean" },
        kitsuneUrl: { type: "string" },
        kitsuneVoice: { type: "string" },
        kitsuneScript: { type: "string" },
        apiUrl: { type: "string" },
        apiModel: { type: "string" },
        apiVoice: { type: "string" },
        apiInstructions: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}

const providerError = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
  additionalProperties: false,
}

const stringArray = (items: object) => ({
  type: "array",
  items,
})

export const Voice = Rpc.define({
  id: "nakamura-voice.rpc",
  methods: {
    getSettings: {
      input: empty,
      output: settings,
    },
    setSettings: {
      input: settings,
      output: empty,
    },
    listVoices: {
      input: empty,
      output: {
        type: "object",
        properties: {
          voices: stringArray({
            type: "object",
            properties: {
              shortName: { type: "string" },
              name: { type: "string" },
              gender: { type: "string" },
              locale: { type: "string" },
            },
            required: ["shortName"],
            additionalProperties: false,
          }),
        },
        required: ["voices"],
        additionalProperties: false,
      },
    },
    listModels: {
      input: {
        type: "object",
        properties: { provider: { type: "string" } },
        required: ["provider"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          models: stringArray({
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              price: { type: "string" },
            },
            required: ["id"],
            additionalProperties: false,
          }),
        },
        required: ["models"],
        additionalProperties: false,
      },
    },
    transcribe: {
      input: {
        type: "object",
        properties: {
          audioBase64: { type: "string" },
          format: { type: "string" },
        },
        required: ["audioBase64", "format"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      errors: { provider_error: providerError },
    },
    speak: {
      input: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          audioBase64: { type: "string" },
          voice: { type: "string" },
          mimeType: { type: "string" },
        },
        required: ["audioBase64"],
        additionalProperties: false,
      },
      errors: { provider_error: providerError },
    },
    speakPlan: {
      input: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          chunks: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["chunks"],
        additionalProperties: false,
      },
      errors: { provider_error: providerError },
    },
    speakChunk: {
      input: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          audioBase64: { type: "string" },
          mimeType: { type: "string" },
        },
        required: ["audioBase64", "mimeType"],
        additionalProperties: false,
      },
      errors: { provider_error: providerError },
    },
    speakPrepare: {
      input: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string" },
        },
        required: ["id", "url"],
        additionalProperties: false,
      },
      errors: { provider_error: providerError },
    },
    speakCancel: {
      input: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      output: empty,
    },
    lastAssistantText: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          messageID: { type: "string" },
          text: { type: "string" },
        },
        required: ["messageID", "text"],
        additionalProperties: false,
      },
      errors: {
        not_found: {
          type: "object",
          properties: { sessionID: { type: "string" } },
          required: ["sessionID"],
          additionalProperties: false,
        },
      },
    },
    debugLog: {
      input: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
