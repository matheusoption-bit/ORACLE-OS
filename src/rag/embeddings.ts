import { Embeddings } from '@langchain/core/embeddings';
import { pipeline, env } from '@xenova/transformers';
import { OpenAIEmbeddings } from '@langchain/openai';

// Desabilita cache do browser caso estejamos em ambiente estrito de Node
env.useBrowserCache = false;

// Configura o host e caminho de cache das models locais
// Para não baixar modelos pesados toda vez, eles ficam cacheados no .cache do node_modules
env.localModelPath = './.cache/models';

class LocalTransformersEmbeddings extends Embeddings {
  private modelName: string;
  private pipe: any;
  private initializationPromise: Promise<void> | null = null;

  constructor(modelName: string = 'Xenova/all-MiniLM-L6-v2') {
    super({ maxConcurrency: 1 });
    this.modelName = modelName;
  }

  private async initialize() {
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = new Promise(async (resolve, reject) => {
      try {
        console.log(`⏳ Inicializando modelo local de embeddings: ${this.modelName}...`);
        // Usamos 'feature-extraction' para gerar vetores densos (embeddings)
        this.pipe = await pipeline('feature-extraction', this.modelName);
        console.log(`✅ Modelo ${this.modelName} carregado com sucesso.`);
        resolve();
      } catch (err) {
        console.error(`❌ Erro ao baixar ou inicializar o modelo ${this.modelName}:`, err);
        reject(err);
      }
    });

    return this.initializationPromise;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    await this.initialize();
    
    // Processa os documentos em batelada
    const embeddings: number[][] = [];
    for (const doc of documents) {
      const output = await this.pipe(doc, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(output.data) as number[]);
    }
    
    return embeddings;
  }

  async embedQuery(document: string): Promise<number[]> {
    await this.initialize();
    const output = await this.pipe(document, { pooling: 'mean', normalize: true });
    return Array.from(output.data) as number[];
  }
}

// Singleton da instância de Embeddings
let embeddingsInstance: Embeddings | null = null;

export async function getEmbeddings(): Promise<Embeddings> {
  if (embeddingsInstance) return embeddingsInstance;

  try {
    // Tenta instanciar o provedor local gratuito (Xenova)
    embeddingsInstance = new LocalTransformersEmbeddings('Xenova/all-MiniLM-L6-v2');
    
    // Força uma inicialização dummy para testar se há erros no ONNX runtime
    await embeddingsInstance.embedQuery('test initialization');
    
    return embeddingsInstance;
  } catch (err) {
    console.error('⚠️ Fallback: Xenova falhou. Iniciando OpenAI Embeddings.');
    // Fallback: se houver alguma quebra de binário ONNX Runtime no ambiente host, usa OpenAI
    // NOTA: Requer process.env.OPENAI_API_KEY
    embeddingsInstance = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
    });
    return embeddingsInstance;
  }
}
