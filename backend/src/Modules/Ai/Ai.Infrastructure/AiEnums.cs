namespace Ai.Infrastructure;

public enum AiProvider { Anthropic, OpenAI, Google, Groq }

public enum AiTask { QuestionClassify, QuestionDraft, DataAssistant, CatalogWrite, CatalogJudge, InvoiceRead, ShortText }

public enum AiOutcome { Ok, Error, Fallback, Limited }

public enum AiCatalogJobStatus { Queued, Running, PausedBudget, PausedUnavailable, Done, Cancelled }

public enum AiCatalogItemStatus { Pending, NeedsCategory, Review, Approved, Discarded, Failed }
