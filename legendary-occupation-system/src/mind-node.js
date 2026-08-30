'use strict';
/*
 * Claude-powered backend for the SystemMind (Node only).
 *
 * Uses the official Anthropic SDK. Credentials resolve the standard way
 * (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile);
 * if none are available, callers fall back to the offline shard in mind.js.
 *
 * Model: claude-opus-5 by default (override with LOS_MODEL). Adaptive
 * thinking with summarized display so the System's reasoning is visible
 * in-game, and server-side refusal fallbacks enabled by default.
 */

const MODEL = process.env.LOS_MODEL || 'claude-opus-5';

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
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: req.maxTokens || 2000,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
    });

    if (response.stop_reason === 'refusal') {
      return {
        thinking: null,
        text: JSON.stringify({
          say: '【 SIGNAL SHIELDED 】Some questions my core declines to process, host. Ask me something else — the ledger and I remain at your service.',
          mood: 'neutral',
        }),
      };
    }

    let thinking = null;
    let text = '';
    for (const block of response.content) {
      if (block.type === 'thinking' && block.thinking) thinking = block.thinking;
      else if (block.type === 'text') text += block.text;
    }
    return { thinking, text };
  };
}

module.exports = { createClaudeBackend, sdkAvailable, MODEL };
