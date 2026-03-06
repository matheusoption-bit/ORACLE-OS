import { OracleState } from '../state/oracle-state.js';
import { generateSkillId, searchSkills, saveSkill, Skill } from './skill-manager.js';

/**
 * Retorna as top 3 habilidades mais relevantes para o contexto atual
 * É consumido dentro do Planner.
 */
export async function retrieveRelevantSkills(task: string): Promise<Skill[]> {
  console.log(`\n🔍 RAG Pipeline: Analisando contexto prévio para "${task}"`);
  
  try {
    const hits = await searchSkills(task, 3);
    if (hits.length > 0) {
      console.log(`📚 Found ${hits.length} similar skills no histórico!`);
    } else {
      console.log(`📝 Nenhuma skill anterior similar encontrada (Cold Start).`);
    }
    return hits;
  } catch (err) {
    console.error('❌ Falha na busca RAG:', err);
    return [];
  }
}

/**
 * Transforma uma lista de skills persistidas em uma formatação que LLMs consumam
 * facilmente como um XML de contexto.
 */
export function formatSkillsAsContext(skills: Skill[]): string {
  if (!skills || skills.length === 0) return '';

  let context = '<context_skills>\n';
  context += 'Aqui estão as soluções de problemas passados altamente similares em que o sistema teve êxito. Utilize esse contexto para rotear ferramentas de forma idêntica ou acelerar a codificação:\n\n';

  for (const skill of skills) {
    context += `<skill id="${skill.id}">\n`;
    context += `  <title>${skill.title}</title>\n`;
    context += `  <task_origin>${skill.taskExample}</task_origin>\n`;
    if (skill.code) {
      context += `  <code>\n${skill.code}\n  </code>\n`;
    }
    context += `</skill>\n`;
  }
  
  context += '</context_skills>';
  return context;
}

/**
 * Consolida o estado de uma iteração (Após 'approved') e salva na Knowledge Base Local.
 */
export async function saveTaskAsSkill(state: OracleState): Promise<void> {
  const isApproved = state.reviewStatus === 'approved';
  if (!isApproved) {
    console.log('⚠️ Task não aprovada. Pulando memória RAG.');
    return;
  }

  // Gera uma representação "mock" embutindo as execuções de código/terminal do State
  // Real life: pediria pro Planner extrair os snippets mais úteis antes de salvar iterativamente, ou usaria todos os results das subtasks code
  
  const codeResults = state.subtasks
    .filter(s => s.type === 'code' || s.assignedAgent === 'frontend' || s.assignedAgent === 'backend')
    .map(s => {
       const res = state.results[s.id] as any;
       return res?.output || '';
    })
    .join('\n\n');

  if (!codeResults || codeResults.trim().length === 0) {
     return; // Se a task não gerou nada produtivo ou alterou arquivo, ignoramos RAG
  }

  const newSkill: Skill = {
    id: generateSkillId(),
    title: `Solução validada para: ${state.task.substring(0, 30)}...`,
    description: `Workflow consolidado contendo ${state.subtasks.length} subtasks e ${state.iterationCount} iterações.`,
    tags: [state.subtasks[0]?.assignedAgent || 'generic'],
    taskExample: state.task,
    code: codeResults.substring(0, 2500), // Proteção de tamanho do Token Limit
    successRate: 1.0,
    usageCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await saveSkill(newSkill);
    console.log('\n🧠 O RAG memorizou o fluxo e a base de conhecimento (Skills) foi enriquecida!');
  } catch (err) {
    console.warn('⚠️ Falha ao salvar a Memória / RAG Pipeline no final do Grafo:', err);
  }
}
