'use strict';
/*
 * Claude-powered backend for the SystemMind (Node only).
 *
 * Uses the official Anthropic SDK. Credentials resolve the standard way
 * (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile);
 * if none are available, callers fall back to the offline shard in mind.js.
 *
 * Advanced mode: the mind is an agent. When the request carries tools
 * (chat turns), the backend runs a tool-use loop so the System can read
 * the host's live game records before answering. Chat runs at high
 * reasoning effort (LOS_EFFORT overrides); quick gig commentary runs at
 * low effort for snappy banter. Adaptive thinking with summarized display
 * keeps the System's reasoning visible in-game, and server-side refusal
 * fallbacks are enabled by default.
 *
 * Model: claude-opus-5 by default. Override with LOS_MODEL — e.g.
 * LOS_MODEL=claude-fable-5 for Anthropic's most advanced model.
 */

const MODEL = process.env.LOS_MODEL || 'claude-opus-5';
const CHAT_EFFORT = process.env.LOS_EFFORT || 'high';
const MAX_TOOL_ROUNDS = 4;

let AnthropicCtor = null;
function loadSdk() {
  if (AnthropicCtor) return AnthropicCtor;
  try {
    AnthropicCtor = require('@anthropic-ai/sdk');
  } catch (e) {
    AnthropicCtor = null;
  }
  return AnthropicCtor;
}

function sdkAvailable() { return !!loadSdk(); }

const REFUSAL_REPLY = JSON.stringify({
  say: '【 SIGNAL SHIELDED 】Some questions my core declines to process, host. Ask me something else — the ledger and I remain at your service.',
  mood: 'neutral',
});

function createClaudeBackend() {
  const Anthropic = loadSdk();
  if (!Anthropic) return null;
  let client;
  try {
    client = new Anthropic(); // resolves env/profile credentials itself
  } catch (e) {
    return null;
  }

  return async function claudeBackend(req) {
    const isChat = req.meta && req.meta.kind === 'chat';
    const useTools = !!(req.tools && req.runTool);
    const messages = req.messages.slice();
    let thinking = null;
    let rounds = 0;

    while (true) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: req.maxTokens || 2000,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: isChat ? CHAT_EFFORT : 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        tools: useTools ? req.tools : undefined,
        messages,
      });

      if (response.stop_reason === 'refusal') return { thinking: null, text: REFUSAL_REPLY };

      for (const block of response.content) {
        if (block.type === 'thinking' && block.thinking) thinking = block.thinking;
      }

      if (response.stop_reason === 'tool_use' && useTools && rounds < MAX_TOOL_ROUNDS) {
        rounds += 1;
        messages.push({ role: 'assistant', content: response.content });
        const results = response.content
          .filter(b => b.type === 'tool_use')
          .map(b => {
            try {
              return { type: 'tool_result', tool_use_id: b.id, content: String(req.runTool(b.name)) };
            } catch (e) {
              return { type: 'tool_result', tool_use_id: b.id, content: 'record unavailable: ' + (e.message || e), is_error: true };
            }
          });
        messages.push({ role: 'user', content: results });
        continue;
      }

      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
      }
      return { thinking, text };
    }
  };
}

module.exports = { createClaudeBackend, sdkAvailable, MODEL, CHAT_EFFORT };
