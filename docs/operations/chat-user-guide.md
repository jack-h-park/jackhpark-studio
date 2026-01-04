# Chat Assistant User Guide

This guide explains how to configure the AI Chat Assistant for your specific needs. While the system comes with optimized defaults, you can customize the behavior for each session using the **App Settings**.

---

## 1. Accessing Settings

To open the configuration menu:

1.  Locate the **Gear Icon** (`⚙️`) in the chat interface header.
2.  Click to open the **Advanced Settings** drawer.
    - _Note: Settings applied here affect only your CURRENT session. They do not change global defaults._

---

## 2. Model Selection

You can switch the underlying AI model to balance speed, cost, and reasoning capability.

### Available Models

- **GPT-4o (OpenAI):** The default high-intelligence model. Best for complex reasoning, coding tasks, and nuanced writing.
- **Gemini 1.5 Pro (Google):** Excellent for large context windows. Use this if you are pasting very large documents or code snippets.
- **Gemini 1.5 Flash:** Optimized for speed. Use for quick Q&A where latency matters more than depth.
- **Local LLMs (Ollama/LM Studio):** (If configured) Runs entirely on your machine. Privacy-first, but performance depends on your hardware.

---

## 3. Creativity Controls (Temperature)

The **Temperature** slider controls how "random" or "creative" the AI's responses are.

- **Precise (0.0 - 0.3):**
  - **Behavior:** Deterministic, stick-to-the-facts.
  - **Use Case:** Coding, factual Q&A, extracting data.
- **Balanced (0.4 - 0.7):**
  - **Behavior:** Natural conversation with moderate variability.
  - **Use Case:** General chatting, email drafting.
- **Creative (0.8 - 1.0):**
  - **Behavior:** Highly variable, imaginative, occasionally chaotic.
  - **Use Case:** Brainstorming, creative writing, poetry.

---

## 4. Safe Mode

**Safe Mode** is a reliability switch accessible in the settings drawer.

### What it does

- **Disables RAG:** The assistant will **NOT** search the knowledge base.
- **Disables Tools:** The assistant will not try to browse the web or execute code.
- **Pure Reasoning:** It forces the model to rely solely on its internal training data and the text you provide in the chat.

### When to use it

- **Hallucination Check:** If the bot is confusing external specific knowledge with general facts, turn on Safe Mode to see what the base model "knows".
- **Performance Issues:** If the vector database is slow or down, Safe Mode restores instant responsiveness.

---

## 5. Troubleshooting & Debugging

For advanced users, the **Debug Dashboard** (visible if you have admin permissions) provides deep insights:

- **Retrieval Scores:** See exactly which documents were found and their relevance score (0.0 - 1.0).
- **Latency Breakdown:** See how long the system spent searching vs generating tokens.
