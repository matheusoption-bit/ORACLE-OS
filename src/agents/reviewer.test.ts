import { expect, test, vi, describe, beforeEach } from 'vitest';
import { reviewerAgent } from './reviewer.js';
import { createInitialState } from '../state/oracle-state.js';
import * as registry from '../models/model-registry.js';

vi.mock('../models/model-registry.js', async () => {
  const actual = await vi.importActual('../models/model-registry.js');
  return {
    ...actual,
    createModel: vi.fn(),
  };
});

describe('Reviewer Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockModelResponse = (mockOutput: any) => {
    const invokeMock = vi.fn().mockResolvedValue(mockOutput);
    const withStructuredOutputMock = vi.fn().mockReturnValue({ invoke: invokeMock });
    vi.mocked(registry.createModel).mockReturnValue({
      withStructuredOutput: withStructuredOutputMock,
    } as any);
  };

  test('Reviewer aprova resultado válido', async () => {
    mockModelResponse({
      reviewStatus: 'approved',
      revisionNotes: '',
    });

    const state = createInitialState('Criar componente de teste');
    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('approved');
    expect(result.iterationCount).toBe(1);
  });

  test('Reviewer rejeita resultado com erros (needs_revision)', async () => {
    mockModelResponse({
      reviewStatus: 'needs_revision',
      revisionNotes: 'O arquivo x está faltando tratamento de exceção',
    });

    const state = createInitialState('Rotina com falhas');
    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('needs_revision');
    expect(result.revisionNotes).toBe('O arquivo x está faltando tratamento de exceção');
    expect(result.iterationCount).toBe(1); // Incrementa para próxima iteração
  });

  test('Reviewer força aprovação após 3 tentativas atigirem o limite', async () => {
    // Simulamos que o LLM continuou pedindo revisão ou rejeitando
    mockModelResponse({
      reviewStatus: 'rejected',
      revisionNotes: 'Não consertaram o erro ainda!',
    });

    const state = createInitialState('Tarefa infinita');
    state.iterationCount = 2; // Significa que a próxima é a 3 (o limite)

    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('approved');
    expect(result.revisionNotes).toContain('[FORCED APPROVAL - MAX ITERATIONS EXCEEDED]');
    expect(result.iterationCount).toBe(3);
  });

  test('reviewStatus é atualizado corretamente no state em caso de erro da API', async () => {
    // Simulamos falha na API ou no binding z.object()
    const invokeMock = vi.fn().mockRejectedValue(new Error('API Model Error'));
    const withStructuredOutputMock = vi.fn().mockReturnValue({ invoke: invokeMock });
    vi.mocked(registry.createModel).mockReturnValue({
      withStructuredOutput: withStructuredOutputMock,
    } as any);

    const state = createInitialState('Teste de falha na API');
    const result = await reviewerAgent(state);

    expect(result.reviewStatus).toBe('needs_revision');
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.iterationCount).toBe(1);
  });
});
