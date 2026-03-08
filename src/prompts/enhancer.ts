import { PROMPT_ENHANCER_SYSTEM, ENHANCEMENT_EXAMPLES } from './enhancer.prompt.js';
import { createModel, DEFAULT_MODELS } from '../models/model-registry.js';
import { config } from '../config.js';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

export const EnhancedPromptSchema = z.object({
  originalPrompt: z.string(),
  enhancedPrompt: z.string(),
  complexity: z.enum(['low', 'medium', 'high']),
  estimatedSubtasks: z.number(),
  estimatedTokens: z.number(),
  suggestedMode: z.enum(['planning', 'standard']),
});

export type EnhancedPrompt = z.infer<typeof EnhancedPromptSchema>;

export class PromptEnhancer {
  async enhance(userPrompt: string, context?: {
    existingFiles?: string[];
    projectStack?: string[];
    recentTasks?: string[];
  }): Promise<EnhancedPrompt> {
    const analystConfig = config?.agents?.analyst ?? config?.agents?.planner ?? {
      modelId: DEFAULT_MODELS.planner,
      temperature: 0.3,
    };

    const model = createModel({
      modelId: analystConfig.modelId, // Use the analyst model for reasoning (fallback to planner)
      temperature: 0.2, // Low temperature for consistent output
    });

    const structuredModel = model.withStructuredOutput(EnhancedPromptSchema);

    let contextString = '';
    if (context) {
      contextString = `\n\n<context>\n`;
      if (context.existingFiles) contextString += `Arquivos existentes: ${context.existingFiles.join(', ')}\n`;
      if (context.projectStack) contextString += `Stack do projeto: ${context.projectStack.join(', ')}\n`;
      if (context.recentTasks) contextString += `Tarefas recentes: ${context.recentTasks.join(', ')}\n`;
      contextString += `</context>`;
    }

    const examplesString = ENHANCEMENT_EXAMPLES.map((ex, i) => 
      `\nExemplo ${i + 1}:\nEntrada: ${ex.input}\nSaída Esperada: ${ex.output}`
    ).join('\n');

    const promptMessage = `
\${PROMPT_ENHANCER_SYSTEM}

\${examplesString}
\${contextString}

<tarefa_usuario>
\${userPrompt}
</tarefa_usuario>

Analise a tarefa do usuário e gere o prompt aprimorado em JSON, conforme as regras estabelecidas.
    `;

    try {
        const result = await structuredModel.invoke([new HumanMessage(promptMessage)]);
        return result;
    } catch (error) {
        console.error("Erro ao aprimorar prompt:", error);
        // Fallback em caso de erro da LLM
        return {
            originalPrompt: userPrompt,
            enhancedPrompt: userPrompt, // Usar o original como fallback
            complexity: 'medium',
            estimatedSubtasks: 3,
            estimatedTokens: 1000,
            suggestedMode: 'standard'
        };
    }
  }

  detectMode(prompt: string): 'planning' | 'standard' {
    const lowerPrompt = prompt.toLowerCase();
    // Heurísticas simples para fallback se a LLM falhar
    if (lowerPrompt.includes('planejar') || lowerPrompt.includes('arquitetura') || lowerPrompt.includes('analise')) {
        return 'planning';
    }
    return 'standard';
  }

  estimateCost(enhanced: EnhancedPrompt): {
    estimatedTokens: number;
    estimatedCostUSD: number;
    estimatedTimeSeconds: number;
  } {
    return {
        estimatedTokens: enhanced.estimatedTokens,
        estimatedCostUSD: (enhanced.estimatedTokens / 1000) * 0.015, // Estimativa baseada em um custo médio
        estimatedTimeSeconds: enhanced.estimatedSubtasks * 10 // Estimativa grosseira de 10s por subtask
    };
  }
}
