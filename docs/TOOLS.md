# WP-9 Tool System & Specialist Skills

## 1. Tool Invariants
- **Model Chooses Tool**: The LLM determines if a tool is required.
- **Tool Returns Data**: The tool executes deterministically in isolation.
- **Model Explains Data**: The LLM formats and explains the tool's verified output.
- **No Hallucination**: The model is forbidden from inventing tool results.

## 2. Implemented Tools
- **Calculator**: Evaluates mathematical and arithmetic expressions safely without `eval`.
- **Weather**: Fetches current weather observations for requested cities.
- **Time & Date**: Computes exact local timestamps and timezone adjustments.
- **Location**: Resolves coordinates and city details.
- **WhatsApp**: Dispatches typing presence updates and reads messages.
- **Web Intelligence**: Performs external queries through `WebResearchPipeline`.

## 3. Specialist Skills
- `smalltalk`: Friendly greetings, pleasantries, acknowledgments.
- `business`: Portfolio, availability, and pricing inquiries regarding Tarik's software development work.
- `research`: Bridges live web intelligence when questions need real-time data.
