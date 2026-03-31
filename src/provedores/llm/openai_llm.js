
export function createOpenAILlm({
    apiKey,
    model = 'gpt-4o-mini',
    systemPrompt = '',
    tools = [],
    toolExecutor
  }) {
    return {
      async generate({ messages }) {
        const input = [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ];
  
        const mappedTools = tools.map(h => ({
          type: 'function',
          function: {
            name: h.function.name,
            description: h.function.description,
            parameters: h.function.parameters
          }
        }));
  
        let res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: input,
            tools: mappedTools,
            tool_choice: 'auto'
          })
        });
  
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`LLM OpenAI error: ${res.status} ${text}`);
        }
  
        let data = await res.json();
        let message = data.choices[0].message;
  
        // Manejo de tool calls
        if (message.tool_calls && toolExecutor) {
          const toolMessages = [...input, message];
  
          for (const call of message.tool_calls) {
            const args = safeJsonParse(call.function.arguments, {});
            const result = await toolExecutor(call.function.name, args);
  
            toolMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result ?? {})
            });
          }
  
          res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model,
              messages: toolMessages
            })
          });
  
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`LLM OpenAI tool-followup error: ${res.status} ${text}`);
          }
  
          data = await res.json();
          message = data.choices[0].message;
        }
  
        return {
          text: message.content || '',
          usage: {
            total: data.usage?.total_tokens ?? 0,
            input: data.usage?.prompt_tokens ?? 0,
            output: data.usage?.completion_tokens ?? 0
          }
        };
      }
    };
  }
  
  function safeJsonParse(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }