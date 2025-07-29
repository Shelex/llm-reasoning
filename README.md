# Local LLM reasoning just for fun

**TL;DR**: A TypeScript-first, self-improving, graph-oriented reasoning system that transforms your local LLM into a PhD-level overthinker with existential crisis detection and automatic retry mechanisms.

RAG approach contains hybrid retrieval via vector+bm25 search and colBERT reranking.

## What This Cursed Thing Actually Does

This abomination of code takes your innocent little questions and puts them through a meat grinder of reasoning (LMAO) strategies. It's like having a very anxious AI assistant that second-guesses itself so much it takes an eternity to get something out of it.

Ok, if seriously:

-   **MAP Planner**: Decomposes queries into atomic subtasks using Model-as-Planner paradigm
-   **LangGraph Orchestration**: Stateful graph execution with checkpoints and resumable runs
-   **Subtask Chaining**: Each subtask builds upon previous results for coherent reasoning
-   **RAG**: Qdrant vector database with hybrid search (BM25 + vector) and ColBERT reranking, subtasks context population
-   **Document Chunking**: Text splitting with LangChain for better retrieval
-   **Strategy Selection**: Adaptive reasoning (so-called) (CoT, SoT, GoT, CCoT) per subtask
-   **Self-Refine**: Continuous improvement through critic feedback loops
-   **LLM Client**: Works with both local LM Studio and OpenRouter via OpenAI-compatible API

## Architecture Overview

### MAP Planner with LangGraph.js

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Planner       │───▶│    Executor      │───▶│   Synthesizer   │
│  (Decompose)    │    │ (Chain Subtasks) │    │ (Final Answer)  │
└─────────────────┘    └────────┬─────────┘    └─────────────────┘
                                │
                         ┌──────▼───────┐
                         │    Critic    │
                         │ (Self-Refine)│
                         └──────────────┘
```

### RAG System

```
Query ──▶ [Hybrid Search] ──▶ [Self-Grader] ──▶ [Query Rewrite] ──▶ Results
            │                     │                    │
            ▼                     ▼                    ▼
       BM25 + Vector         Confidence < 0.8?    Loop (max 3x)
       ColBERT Rerank        Yes: Rewrite          Store Patterns
```

### What the heck is hybrid search in RAG?

Basically it means that we do not rely 100% on vector search, but also use traditional keyword search (like BM25) to find relevant documents. This way we can get more relevant results (hopefully). For this project it definitely improved the quality and the context flow in general (over previous implementations with custom implementations, in-memory storage and custom retrieval logic by pattern-matching).

Hybrid systems have been found in benchmarks like BEIR to significantly improve retrieval accuracy, recall, and robustness over single-method systems.
For example, a 2025 study in CLEF CheckThat! competition used BM25 + vector retrieval, showing best-in-class mean reciprocal rank with only a 2% gap to the top system, all with open-source models.

More details:

-   [milvus.io | What are the benefits of hybrid search architectures?](https://milvus.io/ai-quick-reference/what-are-the-benefits-of-hybrid-search-architectures)
-   [lancedb | Hybrid Search: Combining BM25 and Semantic Search for Better Results with Langchain](https://blog.lancedb.com/hybrid-search-combining-bm25-and-semantic-search-for-better-results-with-lan-1358038fe7e6/)
-   [arxiv | Domain-specific Question Answering with Hybrid Search](https://arxiv.org/abs/2412.03736)
-   [arxiv | From Retrieval to Generation: Comparing Different Approaches](https://arxiv.org/abs/2502.20245)
-   [arxiv | Deep Retrieval at CheckThat! 2025: Identifying Scientific Papers from Implicit Social Media Mentions via Hybrid Retrieval and Re-Ranking](https://arxiv.org/abs/2505.23250)
-   [arxiv | ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT](https://arxiv.org/abs/2004.12832)

### Subtask Context Flow

```
Subtask 1: ┌─────────┐ ──▶ Result 1
           │ Context │
           └─────────┘

Subtask 2: ┌─────────┐ ──▶ Result 2
           │ Context │ ◀── Result 1 + RAG Context
           └─────────┘

Subtask 3: ┌─────────┐ ──▶ Result 3
           │ Context │ ◀── Result 1 + Result 2 + RAG Context
           └─────────┘
```

## Example Usage

### M1 Pro Setup Example

-   **Hardware**: M1 Pro, 16GB RAM
-   **LLM**: `bartowski/llama-3.2-3b-instruct` Q4_K_S GGUF (1.93 GB)
-   **Embeddings**: `text-embedding-nomic-embed-text-v1.5` (84 MB)
-   **Reranking**: `text-embedding-colbertv2.0` Q8_0 (118 MB)
-   **Vector DB**: Qdrant in Docker

### Query Processing Flow

```bash
# Start Qdrant
docker run -p 6333:6333 -p 6334:6334 -v "$(pwd)/qdrant_storage:/qdrant/storage:z" qdrant/qdrant

# Create chat session
curl -X POST http://localhost:3000/api/chat/create

# Send complex query
curl -X POST http://localhost:3000/api/chat/{chatId}/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the ways to improve LLM accuracy?", "reason": true}'
```

## 🚀 Installation & Setup

### Prerequisites

-   Node.js 20+
-   Docker (for Qdrant)
-   local LM Studio + models (as specified in example) OR OpenRouter API key

### Quick Start

```bash
# Clone and install
git clone <repo-url>
cd llm-reasoning
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration

# Start Qdrant vector database
docker run -p 6333:6333 -p 6334:6334 \
  -v "$(pwd)/qdrant_storage:/qdrant/storage:z" \
  qdrant/qdrant

# Start development server
npm run dev
```

### Environment Configuration

#### LM Studio Setup

```env
LLM_PROVIDER=lmstudio
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=local-model
```

#### OpenRouter Setup

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<your_api_key_here>
OPENROUTER_MODEL=deepseek/deepseek-chat-v3-0324:free
```

## Reasoning Strategies

### 1. **Chain of Thought (CoT)**

-   **Best for**: Logical reasoning, math problems, step-by-step analysis
-   **Approach**: Sequential thinking with explicit reasoning steps

### 2. **Skeleton of Thought (SoT)**

-   **Best for**: Structured responses, categorization, comprehensive coverage
-   **Approach**: Create outline first, then fill in details

### 3. **Constrained Chain of Thought (CCoT)**

-   **Best for**: Critical accuracy, rule-based reasoning, compliance
-   **Approach**: Guided thinking with explicit constraints

### 4. **Graph of Thoughts (GoT)**

-   **Best for**: Complex interconnected problems, multi-perspective analysis
-   **Approach**: Network of related concepts and connections

## API

### Chat Management

-   `POST /api/chat/create` - Create a new chat aka session
-   `DELETE /api/chat/:id` - Perform digital euthanasia on a chat
-   `GET /api/chat/:id/history` - Dig up the chat's tragic backstory
-   `GET /api/chats` - Just in case you have lost that one chat id

### Question management

-   `POST /api/chat/:id/ask` - Ask your question and watch the loading for some time. Answer is optional if request will not be killed by timeout

**Request Body Schema:**

```json
{
    "query": "Why do humans exist?",
    "reason": true // if false - will send the question directly to llm, if yes - godspeed
}
```

### Health Check

-   `GET /api/health` - System health check
-   WebSocket events for real-time processing updates

## Common Issues

1. **LM Studio Not Running**: No LLM - No problem, but this app will not work as well (for good or bad - dunno)
2. **Confidence Always Low**: LLM got depression and existential crisis - throw it out and try bigger one (bigger !== better though)

## License 📄

```
GLWTS(Good Luck With That Stuff) Public License
Copyright (c) Every-fucking-one, except the Author

Everyone is permitted to copy, distribute, modify, merge, sell, publish,
sublicense or whatever the fuck they want with this software but at their
OWN RISK.

                             Preamble

The author has absolutely no fucking clue what the code in this project
does. It might just fucking work or not, there is no third option.

                GOOD LUCK WITH THAT STUFF PUBLIC LICENSE

TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION, AND MODIFICATION

0. You just DO WHATEVER THE FUCK YOU WANT TO as long as you NEVER LEAVE
   A FUCKING TRACE TO TRACK THE AUTHOR of the original product to blame for
   or hold responsible.

IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

Good luck and Godspeed.
```
