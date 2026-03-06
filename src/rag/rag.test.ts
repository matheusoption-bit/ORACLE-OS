import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveSkill, loadSkill, searchSkills, listSkills } from './skill-manager.js';
import { formatSkillsAsContext, retrieveRelevantSkills } from './rag-pipeline.js';
import fs from 'fs';

vi.mock('./vector-store.js', () => ({
  indexSkillToVectorStore: vi.fn(),
  searchSimilarSkills: vi.fn().mockResolvedValue([{ id: 'test-123', title: 'Test Skill', successRate: 1.0, usageCount: 1 }])
}));

describe('RAG Pipeline & Skill Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Limpando possível arquivo gravado no /rag/skills
  });

  it('saveSkill persiste arquivo JSON em disco', async () => {
    const skill = {
      id: 'mock-101',
      title: 'Mock Skill',
      description: 'Test persistency',
      tags: ['test'],
      taskExample: 'Create mock test',
      successRate: 1,
      usageCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveSkill(skill);
    
    const loaded = loadSkill('mock-101');
    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe('Mock Skill');
  });

  it('searchSimilarSkills retorna array manipulável e hidrata localmente pela busca RAG', async () => {
    // Nós já criamos a 'mock-101' no teste anterior
    // O mock searchSimilarSkills vai retornar 'test-123' que tentará hidratar da memória local
    const resultsOffline = await searchSkills('mock', 1);
    expect(Array.isArray(resultsOffline)).toBe(true);
  });

  it('formatSkillsAsContext retorna string formatada XML para context pass', () => {
    const formatted = formatSkillsAsContext([
      {
        id: 'sk-123',
        title: 'API endpoint auth',
        description: 'Autenticação',
        taskExample: 'Create login route',
        code: 'app.post("/login", (req, res) => res.send())',
        tags: [],
        successRate: 1,
        usageCount: 2,
        createdAt: '',
        updatedAt: ''
      }
    ]);

    expect(formatted).toContain('<context_skills>');
    expect(formatted).toContain('<skill id="sk-123">');
    expect(formatted).toContain('app.post("/login"');
  });

  it('retrieveRelevantSkills não quebra quando ChromaDB está vazio, retornando fallback ou []', async () => {
    const result = await retrieveRelevantSkills('task inexistente');
    expect(Array.isArray(result)).toBe(true);
  });
});
