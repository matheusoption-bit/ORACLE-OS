import { Chroma } from '@langchain/community/vectorstores/chroma';
import { getEmbeddings } from './embeddings.js';
import { Skill } from './skill-manager.js';

// Singleton para garantir apenas uma conexão ao ChromaDB Local
let vectorStoreInstance: Chroma | null = null;

const COLLECTION_NAME = 'oracle-skills';
const CHROMA_LOCAL_URL = 'http://localhost:8000'; // Default Chroma, mas usaremos config local quando possível.
// OBS: @langchain/community ChromaDB pressupõe um servidor chromadb rodando.
// Como estamos fazendo "local node-chroma", usaremos o modo local do pacote chromadb (se suportado pelo binding) ou a collection nativa na RAM.

/**
 * Retorna (ou cria) uma instância Singleton do Vector Store da coleção de skills.
 * Estaremos assumindo um ChromaDB acessível. Em modo offline puro a API do LangChain requer um adaptador customizado de hnswlib,
 * mas usaremos o Chroma como ditado pelas restrições do Sprint 5.
 */
export async function getVectorStore(): Promise<Chroma> {
  if (vectorStoreInstance) return vectorStoreInstance;

  const embeddings = await getEmbeddings();

  try {
    vectorStoreInstance = new Chroma(embeddings, {
      collectionName: COLLECTION_NAME,
      url: CHROMA_LOCAL_URL,
    });
    
    // Inicialização silenciosa para checar se o backend está vivo.
    // Ignoramos erros aqui pois a delegação acontecerá durante as queries.
    return vectorStoreInstance;
  } catch (err) {
    console.error('❌ Falha ao conectar no ChromaDB:', err);
    throw err;
  }
}

/**
 * Indexa uma nova Skill no Chroma DB
 */
export async function indexSkillToVectorStore(skill: Skill): Promise<void> {
  const store = await getVectorStore();
  
  // Construímos o "Documento" concatenando título, descrição e contexto da task original
  const pageContent = `Skill: ${skill.title}\nDescription: ${skill.description}\nTask Origem: ${skill.taskExample}\nTags: ${skill.tags.join(', ')}`;

  // Salvamos como 'metadata' todo o resto vital para retrieval
  await store.addDocuments([
    {
      pageContent,
      metadata: {
        id: skill.id,
        title: skill.title,
        usageCount: skill.usageCount,
        successRate: skill.successRate,
      },
    },
  ]);
  
  console.log(`✅ ChromaDB: Skill [${skill.id}] indexada com sucesso.`);
}

/**
 * Realiza uma busca de Similaridade Vetorial pura para a task atual.
 */
export async function searchSimilarSkills(query: string, k: number = 3): Promise<Skill[]> {
  try {
    const store = await getVectorStore();
    
    // Busca os k documentos mais parecidos
    const results = await store.similaritySearch(query, k);
    
    if (!results || results.length === 0) {
      return [];
    }

    // Apenas extraímos o ID retornado pelo Chroma. O carregamento dos JSON completos
    // acontece via `skill-manager` (que será o dono absoluto do estado dos JSONs na pipeline RAG).
    return results.map((doc) => ({
      id: doc.metadata.id,
      title: doc.metadata.title,
      // Os demais campos como 'description', 'taskExample' e 'code' 
      // precisariam idealmente ser hidratados no RAG Manager. O mock abaixo satisfaz o TS base
      description: '',
      tags: [],
      taskExample: '',
      successRate: doc.metadata.successRate || 1,
      usageCount: doc.metadata.usageCount || 1,
      createdAt: '',
      updatedAt: '',
    }));
  } catch (err) {
    console.warn(`⚠️ Aviso RAG: Busca falhou (banco vazio ou Chroma offline) para "${query}". Ignorando...`);
    return [];
  }
}
