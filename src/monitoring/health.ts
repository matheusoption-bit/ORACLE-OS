import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config.js';
import { COLORS } from './logger.js';

export async function checkHealth() {
  console.log(`\n${COLORS.cyan}🔍 Executando ORACLE-OS Health Check...${COLORS.reset}\n`);

  let isHealthy = true;

  // 1. Checar ENV de Providers configurados
  console.log(`${COLORS.dim}── LLM Providers ──${COLORS.reset}`);
  
  const activeProviders = [
    config.agents.planner.modelId,
    config.agents.executor.modelId,
    config.agents.reviewer.modelId
  ];

  const needsOpenAI = activeProviders.some(m => m.includes('gpt'));
  const needsAnthropic = activeProviders.some(m => m.includes('claude'));
  const needsGroq = activeProviders.some(m => m.includes('llama') || m.includes('mixtral')); // Assuming groq handles these logic gates if specified
  const needsGoogle = activeProviders.some(m => m.includes('gemini'));

  if (needsOpenAI && !process.env.OPENAI_API_KEY) {
    console.log(`  ❌ OpenAI: Desconfigurado (Falta OPENAI_API_KEY)`); isHealthy = false;
  } else if (needsOpenAI) {
    console.log(`  ✅ OpenAI: OK`);
  }

  if (needsAnthropic && !process.env.ANTHROPIC_API_KEY) {
    console.log(`  ❌ Anthropic: Desconfigurado (Falta ANTHROPIC_API_KEY)`); isHealthy = false;
  } else if (needsAnthropic) {
    console.log(`  ✅ Anthropic: OK`);
  }

  if (needsGroq && !process.env.GROQ_API_KEY) {
    console.log(`  ❌ Groq: Desconfigurado (Falta GROQ_API_KEY)`); isHealthy = false;
  } else if (needsGroq) {
    console.log(`  ✅ Groq: OK`);
  }

  if (needsGoogle && !process.env.GEMINI_API_KEY) {
    console.log(`  ❌ Gemini: Desconfigurado (Falta GEMINI_API_KEY)`); isHealthy = false;
  } else if (needsGoogle) {
    console.log(`  ✅ Gemini: OK`);
  }

  // 2. Checar Memória local (RAG)
  console.log(`\n${COLORS.dim}── Persistência RAG (Skills) ──${COLORS.reset}`);
  const skillsDir = resolve(process.cwd(), 'rag', 'skills');
  if (existsSync(skillsDir)) {
    const files = readdirSync(skillsDir).filter(f => f.endsWith('.json'));
    console.log(`  ✅ Pasta Skills: OK (${files.length} mock/skills aprendidas)`);
  } else {
    console.log(`  ⚠️ Pasta Skills: Inexistente (Vazia/Sem Cold Start)`);
  }

  // 3. Checar banco local
  const monitoringFile = resolve(process.cwd(), 'monitoring', 'metrics.json');
  console.log(`\n${COLORS.dim}── Monitoramento (Metrics) ──${COLORS.reset}`);
  if (existsSync(monitoringFile)) {
    console.log(`  ✅ Metrics JSON: OK (Sistema já executou Tasks)`);
  } else {
    console.log(`  ⚠️ Metrics JSON: Não há histórico de execuções ainda`);
  }

  console.log(`\n${COLORS.cyan}══════════════════════════════════════${COLORS.reset}`);
  if (isHealthy) {
    console.log(`${COLORS.green}✅ System STATUS: All Green. Ready for Production.${COLORS.reset}\n`);
  } else {
    console.log(`${COLORS.red}❌ System STATUS: Critical failures detected! Resolva os alertas.${COLORS.reset}\n`);
  }
}

// Quando rodar diretamente via npm run health
if (process.argv[1]?.endsWith('health.ts')) {
   checkHealth().catch(console.error);
}
