import { randomUUID } from 'crypto';
import { resolve, join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { indexSkillToVectorStore, searchSimilarSkills } from './vector-store.js';

export interface Skill {
  id: string;
  title: string;
  description: string;
  tags: string[];
  code?: string;          // código da solução
  taskExample: string;    // task original que gerou essa skill
  successRate: number;    // 0-1
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// Diretório local de storage (sem BD externo)
const SKILLS_DIR = resolve(process.cwd(), 'rag', 'skills');

/**
 * Garante que o diretório base existe
 */
function ensureDirectory() {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

/**
 * Salva uma nova skill em JSON no disco e cria seu embedding no VectorStore
 */
export async function saveSkill(skill: Skill): Promise<void> {
  ensureDirectory();
  
  const skillPath = join(SKILLS_DIR, `${skill.id}.json`);
  const data = JSON.stringify(skill, null, 2);
  
  writeFileSync(skillPath, data, 'utf-8');
  console.log(`💾 Skill JSON salvo em disco: ${skill.id}`);

  // Envia para indexação atômica no banco Chroma
  await indexSkillToVectorStore(skill);
}

/**
 * Carrega uma skill específica do disco pelo ID
 */
export function loadSkill(id: string): Skill | null {
  try {
    const skillPath = join(SKILLS_DIR, `${id}.json`);
    if (!existsSync(skillPath)) return null;

    const data = readFileSync(skillPath, 'utf-8');
    return JSON.parse(data) as Skill;
  } catch (err) {
    console.error(`❌ Erro ao ler skill ${id}:`, err);
    return null;
  }
}

/**
 * Lista todas as skills salvas no disco
 */
export function listSkills(): Skill[] {
  ensureDirectory();
  const files = readdirSync(SKILLS_DIR);
  
  const skills: Skill[] = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      const id = file.replace('.json', '');
      const s = loadSkill(id);
      if (s) skills.push(s);
    }
  }
  
  return skills;
}

/**
 * Busca e "hidrata" as skills a partir de uma query textual
 * Faz uso do ChromaDB no background e resolve os metadados com os JSONs.
 */
export async function searchSkills(query: string, k: number = 3): Promise<Skill[]> {
  try {
    // Retorna apenas ID + Metadados básicos
    const vectorizedResults = await searchSimilarSkills(query, k);
    
    // Hidrata os dados reais (código fonte, logs de contexto completo) pegando do disco
    const fullSkills = vectorizedResults
      .map(v => loadSkill(v.id))
      .filter((s): s is Skill => s !== null);
      
    return fullSkills;
  } catch (err) {
    // Fallback: busca boba (text match) caso o Chroma esteja indisponível
    console.warn('⚠️ Fallback RAG: Chroma indisponível, usando regexing manual.');
    const all = listSkills();
    return all.filter(s => 
      s.title.toLowerCase().includes(query.toLowerCase()) || 
      s.taskExample.toLowerCase().includes(query.toLowerCase())
    ).slice(0, k);
  }
}

export function generateSkillId(): string {
  return `sk-${randomUUID().substring(0, 8)}`;
}
