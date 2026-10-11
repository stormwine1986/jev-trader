export type JevValue = string | Record<string, unknown> | unknown[];

export type NoulQuestion = {
  type: "noul";
  instructions: JevValue;
  criteria?: { true?: JevValue; false?: JevValue };
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: JevValue;
  criteria: Record<string, JevValue | null>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: JevValue;
  criteria: JevValue[];
};

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type JevQuestions = Record<string, JevQuestion>;

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

type AnswerFor<Question extends JevQuestion> = Question extends NoulQuestion
  ? NoulAnswer
  : Question extends ChoiceQuestion
    ? ChoiceAnswer
    : ScoreAnswer;

export type JevDecision<Q extends JevQuestions> = {
  model: string;
  answers: { [Key in keyof Q]: AnswerFor<Q[Key]> };
  usage: { input_tokens: number; output_tokens: number };
};

export type JevDecisionClientOptions = {
  apiKey: string;
  model?: string;
  fetcher?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
};

type JevRequest<Q extends JevQuestions> = {
  state: JevValue;
  questions: Q;
};

const JEV_API_URL = "https://api.typesafe.ai/v1/systemone";

export class JevApiError extends Error {
  public readonly status: number;
  public readonly responseBody: string;

  constructor(
    message: string,
    status: number,
    responseBody: string,
  ) {
    super(message);
    this.name = "JevApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class JevDecisionClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: JevDecisionClientOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("A TypeSafe API key is required");
    }

    this.apiKey = options.apiKey;
    this.model = options.model ?? "jev-latest";
    this.fetcher = options.fetcher ?? fetch;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  }

  async decide<Q extends JevQuestions>(
    request: JevRequest<Q>,
  ): Promise<JevDecision<Q>> {
    if (Object.keys(request.questions).length === 0) {
      throw new Error("At least one Jev question is required");
    }

    const body = JSON.stringify({
      state: request.state,
      model: this.model,
      questions: request.questions,
    });

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.fetcher(JEV_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (response.ok) {
        const payload: unknown = await response.json();
        return validateDecision(payload, request.questions) as JevDecision<Q>;
      }

      const responseBody = await response.text();
      const shouldRetry = response.status === 429 || response.status === 529;
      if (!shouldRetry || attempt >= this.maxRetries) {
        throw new JevApiError(
          `Jev API request failed: ${response.status} ${response.statusText}`,
          response.status,
          responseBody,
        );
      }

      await delay(this.retryDelayMs * 2 ** attempt);
    }
  }
}

function validateDecision(
  payload: unknown,
  questions: JevQuestions,
): JevDecision<JevQuestions> {
  if (!isRecord(payload) || typeof payload.model !== "string") {
    throw new Error("Jev API returned an invalid response");
  }

  if (!isRecord(payload.answers) || !isRecord(payload.usage)) {
    throw new Error("Jev API response is missing answers or usage");
  }

  for (const [id, question] of Object.entries(questions)) {
    const answer = payload.answers[id];
    if (!isRecord(answer) || answer.type !== question.type) {
      throw new Error(`Jev API response has an invalid answer for '${id}'`);
    }

    if (question.type === "noul" && !isFiniteNumber(answer.noul)) {
      throw new Error(`Jev API response has an invalid answer for '${id}'`);
    }
    if (
      question.type === "choice" &&
      (typeof answer.choice !== "string" ||
        !isNumberRecord(answer.probabilities) ||
        !isFiniteNumber(answer.confidence))
    ) {
      throw new Error(`Jev API response has an invalid answer for '${id}'`);
    }
    if (
      question.type === "score" &&
      (!isFiniteNumber(answer.score) ||
        !isStringRecord(answer.legend) ||
        !isNumberRecord(answer.probabilities) ||
        !isFiniteNumber(answer.confidence))
    ) {
      throw new Error(`Jev API response has an invalid answer for '${id}'`);
    }
  }

  if (
    !isFiniteNumber(payload.usage.input_tokens) ||
    !isFiniteNumber(payload.usage.output_tokens)
  ) {
    throw new Error("Jev API response has invalid token usage");
  }

  return payload as unknown as JevDecision<JevQuestions>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) && Object.values(value).every((item) => isFiniteNumber(item))
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) && Object.values(value).every((item) => typeof item === "string")
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}