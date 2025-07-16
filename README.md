# Local LLM reasoning just for fun

**TL;DR**: Backend for opinionatedly enhanced local llm that thinks so hard it might immediately regret it.

A TypeScript backend that's basically like giving your LLM a PhD in overthinking, complete with existential crisis detection and automatic retry mechanisms when the AI gets confused about its own intelligence.

## What This Cursed Thing Actually Does

This abomination of code takes your innocent little questions and puts them through a meat grinder of reasoning (LMAO) strategies. It's like having a very anxious AI assistant that second-guesses itself so much it takes an eternity to get something out of it.

Ok, if seriously:

-   **Query Classification & Refinement**: Automatically analyzes and enhances user queries
-   **Decomposition**: Breaks complex queries into manageable subtasks
-   **Semantic Context Management**: Maintains conversation context using vector embeddings
-   **Adaptive Strategy Selection**: Chooses optimal reasoning approaches per query type
-   **Confidence-Based Retry**: Automatically retries low-confidence responses with enhanced context
-   **RAG Integration**: Retrieves and ranks relevant context for improved accuracy

## Example

-   M1 Pro, 16GB RAM
-   LM Studio: `bartowski/llama-3.2-3b-instruct` Q4_K_S GGUF (1.93 Gb), context window of 8k tokens.
-   LM Studio: `text-embedding-nomic-embed-text-v1.5` (84.11 MB) for vector embeddings
-   LM Studio: `text-embedding-colbertv2.0` Q8_0 (117.85 MB) for embeddings re-ranking
-   Qdrant in docker: `docker run -p 6333:6333 -p 6334:6334 -v "$(pwd)/qdrant_storage:/qdrant/storage:z" qdrant/qdrant`
-   started dev server
-   created chat POST /api/chat/create

```json
{
    "chatId": "73d01f65-758f-48a6-9261-6e41460e13b5",
    "status": "created"
}
```

-   sent the question via api:

```
{
    "reason": true,
    "query": "What are the ways to improve the accuracy of answers from LLM?"
}
```

-   logs:

```
[ORCHESTRATOR] Starting query processing for chatId: 4d0eaba2-a881-455b-887a-2ca33574fbeb
[ORCHESTRATOR] Query: What are the ways to improve the accuracy of answers from LLM?
[ORCHESTRATOR] Stage 0: Classifying and refining query
[CLASSIFIER] Classifying and refining query: What are the ways to improve the accuracy of answers from LLM?...
[CLASSIFIER] Raw LLM response: {
  "refinedQuery": "How can the accuracy of LLM answers be improved through data curation, model fine-tuning, or other methods?",
  "intent": "reasoning",
  "complexity": "complex",
  "suggestedSubQuestions": [
    "What is the impact of data quality on LLM accuracy?",
    "How does model fine-tuning affect answer accuracy?"
  ],
  "confidence": 0.92
}
[CLASSIFIER] Parsing LLM response: {
  "refinedQuery": "How can the accuracy of LLM answers be improved through data curation, model fine-tuning, or other methods?",
  "intent": "reasoning",
  "complexity": "complex",
  "suggestedSubQu...
[CLASSIFIER] Query classified - Intent: reasoning, Complexity: complex, Refined: "How can the accuracy of LLM answers be improved through data curation, model fine-tuning, or other methods?"
[ORCHESTRATOR] Query classified - Intent: reasoning, Complexity: complex
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Query classification: {"refinedQuery":"How can the accuracy of LLM answers be improved through data ...
📝 [SEMANTIC] Adding query_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Query classification: {"refinedQuery":"How can the accuracy of LLM answers be improved through data ...
[EMBEDDINGS] Generating embedding for text: query classification  refinedquery   how can the a...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.92)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
[ORCHESTRATOR] Using refined query: "How can the accuracy of LLM answers be improved through data curation, model fine-tuning, or other methods?"
[ORCHESTRATOR] Stage 1: Decomposing refined query
[ORCHESTRATOR] Decomposing query into subtasks
✅ [ORCHESTRATOR] Query decomposed into 5 subtasks
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Query decomposition: {"subTasks":[{"id":"1","query":"What is the impact of data quality on LLM accur...
📝 [SEMANTIC] Adding decomposition context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Query decomposition: {"subTasks":[{"id":"1","query":"What is the impact of data quality on LLM accur...
[EMBEDDINGS] Generating embedding for text: query decomposition  subtasks   id   1   query   w...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.8)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 1: What is the impact of data quality on LLM accuracy?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: graph_of_thoughts for subtask 1
[ORCHESTRATOR] Executing subtask 1 with strategy graph_of_thoughts
[ORCHESTRATOR] Subtask query: "What is the impact of data quality on LLM accuracy?"
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: What is the impact of data quality on LLM accuracy...
[EMBEDDINGS] Generating embedding for text: what is the impact of data quality on llm accuracy...
[EMBEDDINGS] Generated embeddings
🔍 [SEMANTIC] Filtered contexts: 2/2
✅ [SEMANTIC] Retrieved 2 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 2 relevant contexts
📚 [ORCHESTRATOR] Retrieved 2 context items for subtask 1
🎯 [ORCHESTRATOR] Executing graph_of_thoughts strategy for subtask 1
📊 [ORCHESTRATOR] Subtask 1 completed with confidence: 0.8
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided context and knowledge up to 01 March 2023, I have assessed the...
📝 [SEMANTIC] Adding subtask_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided context and knowledge up to 01 March 2023, I have assessed the...
[EMBEDDINGS] Generating embedding for text: subtask result  based on the provided context and ...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.8)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
✅ [ORCHESTRATOR] Subtask 1 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 2: How does model fine-tuning affect answer accuracy?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: constrained_chain_of_thought for subtask 2
[ORCHESTRATOR] Executing subtask 2 with strategy constrained_chain_of_thought
[ORCHESTRATOR] Subtask query: "How does model fine-tuning affect answer accuracy?"
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: How does model fine-tuning affect answer accuracy?...
[EMBEDDINGS] Generating embedding for text: how does model fine tuning affect answer accuracy...
[EMBEDDINGS] Generated embeddings
🔍 [SEMANTIC] Filtered contexts: 3/3
✅ [SEMANTIC] Retrieved 3 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 3 relevant contexts
📚 [ORCHESTRATOR] Retrieved 3 context items for subtask 2
🎯 [ORCHESTRATOR] Executing constrained_chain_of_thought strategy for subtask 2
📊 [ORCHESTRATOR] Subtask 2 completed with confidence: 0.65
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided information, model fine-tuning can affect answer accuracy by a...
📝 [SEMANTIC] Adding subtask_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided information, model fine-tuning can affect answer accuracy by a...
[EMBEDDINGS] Generating embedding for text: subtask result  based on the provided information ...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.65)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔄 [ORCHESTRATOR] Creating retry prompt for subtask 2
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: How does model fine-tuning affect answer accuracy?...
🔍 [SEMANTIC] Filtered contexts: 4/4
✅ [SEMANTIC] Retrieved 4 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 4 relevant contexts
📚 [ORCHESTRATOR] Retrieved 4 additional context items for retry
🎯 [ORCHESTRATOR] Executing retry attempt for subtask 2
📈 [ORCHESTRATOR] Retry completed - Original confidence: 0.65, New confidence: 0.8
✅ [ORCHESTRATOR] Retry successful for subtask 2, new confidence: 0.8
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Retry result: The previous attempt had low confidence (0.65) due to the lack of specific evidence an...
📝 [SEMANTIC] Adding subtask_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Retry result: The previous attempt had low confidence (0.65) due to the lack of specific evidence an...
[EMBEDDINGS] Generating embedding for text: retry result  the previous attempt had low confide...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.8)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
✅ [ORCHESTRATOR] Subtask 2 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 3: What are common data curation methods used to improve LLM accuracy?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: graph_of_thoughts for subtask 3
[ORCHESTRATOR] Executing subtask 3 with strategy graph_of_thoughts
[ORCHESTRATOR] Subtask query: "What are common data curation methods used to improve LLM accuracy?"
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: What are common data curation methods used to impr...
[EMBEDDINGS] Generating embedding for text: what are common data curation methods used to impr...
[EMBEDDINGS] Generated embeddings
🔍 [SEMANTIC] Filtered contexts: 5/5
✅ [SEMANTIC] Retrieved 5 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 5 relevant contexts
📚 [ORCHESTRATOR] Retrieved 5 context items for subtask 3
🎯 [ORCHESTRATOR] Executing graph_of_thoughts strategy for subtask 3
📊 [ORCHESTRATOR] Subtask 3 completed with confidence: 0.95
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided facts and thoroughly verified information, common data curatio...
📝 [SEMANTIC] Adding subtask_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided facts and thoroughly verified information, common data curatio...
[EMBEDDINGS] Generating embedding for text: subtask result  based on the provided facts and th...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.95)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
✅ [ORCHESTRATOR] Subtask 3 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 4: What are the key factors that affect model fine-tuning for LLMs?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: graph_of_thoughts for subtask 4
[ORCHESTRATOR] Executing subtask 4 with strategy graph_of_thoughts
[ORCHESTRATOR] Subtask query: "What are the key factors that affect model fine-tuning for LLMs?"
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: What are the key factors that affect model fine-tu...
[EMBEDDINGS] Generating embedding for text: what are the key factors that affect model fine tu...
[EMBEDDINGS] Generated embeddings
🔍 [SEMANTIC] Filtered contexts: 6/6
✅ [SEMANTIC] Retrieved 6 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 6 relevant contexts
📚 [ORCHESTRATOR] Retrieved 6 context items for subtask 4
🎯 [ORCHESTRATOR] Executing graph_of_thoughts strategy for subtask 4
📊 [ORCHESTRATOR] Subtask 4 completed with confidence: 0.8
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided information and thoroughly verified facts, the key factors tha...
📝 [SEMANTIC] Adding subtask_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on the provided information and thoroughly verified facts, the key factors tha...
[EMBEDDINGS] Generating embedding for text: subtask result  based on the provided information ...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.8)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
✅ [ORCHESTRATOR] Subtask 4 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 5: How do data curation and model fine-tuning interact to improve LLM accuracy?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: graph_of_thoughts for subtask 5
[ORCHESTRATOR] Executing subtask 5 with strategy graph_of_thoughts
[ORCHESTRATOR] Subtask query: "How do data curation and model fine-tuning interact to improve LLM accuracy?"
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: How do data curation and model fine-tuning interac...
[EMBEDDINGS] Generating embedding for text: how do data curation and model fine tuning interac...
[EMBEDDINGS] Generated embeddings
🔍 [SEMANTIC] Filtered contexts: 7/7
✅ [SEMANTIC] Retrieved 7 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 7 relevant contexts
📚 [ORCHESTRATOR] Retrieved 7 context items for subtask 5
🎯 [ORCHESTRATOR] Executing graph_of_thoughts strategy for subtask 5
📊 [ORCHESTRATOR] Subtask 5 completed with confidence: 0.95
📝 [RAG] Adding context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on established principles in the field of natural language processing (NLP) an...
📝 [SEMANTIC] Adding subtask_result context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb: Subtask result: Based on established principles in the field of natural language processing (NLP) an...
[EMBEDDINGS] Generating embedding for text: subtask result  based on established principles in...
[EMBEDDINGS] Generated embeddings
✅ [SEMANTIC] Added context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb (confidence: 0.95)
✅ [RAG] Context added successfully for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
✅ [ORCHESTRATOR] Subtask 5 completed
📝 [ORCHESTRATOR] Stage 3: Synthesizing final answer from 5 subtask results
🔄 [ORCHESTRATOR] Stage 3a: Synthesizing raw answer
🔗 [ORCHESTRATOR] Retrieving relevant context for final synthesis
🔍 [RAG] Retrieving relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🔍 [SEMANTIC] Getting relevant context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb, query: What are the ways to improve the accuracy of answe...
[EMBEDDINGS] Generating embedding for text: what are the ways to improve the accuracy of answe...
[EMBEDDINGS] Generated embeddings
🔍 [SEMANTIC] Filtered contexts: 8/8
✅ [SEMANTIC] Retrieved 2 relevant contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
📊 [RAG] Retrieved 2 relevant contexts
📖 [ORCHESTRATOR] Retrieved 2 context items for final synthesis
✨ [ORCHESTRATOR] Stage 3b: Beautifying answer
🎨 [ORCHESTRATOR] Answer beautification completed
🧹 [RAG] Clearing context for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🧹 [SEMANTIC] Cleared all contexts for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
✅ [RAG] Context cleared for chat 4d0eaba2-a881-455b-887a-2ca33574fbeb
🎉 [ORCHESTRATOR] Query processing completed successfully
```

-   answer:

```text
Improving the Accuracy of Answers from Large Language Models (LLMs)
Large Language Models (LLMs) have revolutionized natural language processing (NLP), enabling machines to understand and generate human-like language. However, the accuracy of LLM answers can be improved through several effective methods.

Data Curation
High-quality training data is essential for achieving high accuracy in LLMs. Data curation involves preprocessing and cleaning the data to ensure it is accurate, complete, and relevant to the task at hand. This step helps reduce noise and errors in the data, which can negatively impact model performance.

Methods for Data Curation
Data Preprocessing: Cleaning and normalizing the data to remove noise, errors, and inconsistencies.

Data Augmentation: Increasing the size of the training dataset by generating new data through techniques such as paraphrasing, back-translation, and synonym replacement.

Active Learning: Selectively sampling data points from the training dataset to actively improve model performance on specific tasks or domains.

Transfer Learning: Using pre-trained models as a starting point and fine-tuning them on smaller, task-specific datasets to adapt to new domains or tasks.

Data Enrichment: Supplementing the training dataset with additional data sources, such as user-generated content, social media posts, or online forums.

Data Validation: Regularly evaluating and validating the quality of the training data to detect biases, errors, or inconsistencies.

Human Evaluation: Involving human evaluators to assess the quality and relevance of the training data, providing feedback on accuracy, coherence, and fluency.

Active Data Curation: Continuously monitoring the training data for quality issues and taking corrective actions to address them.

Model Fine-Tuning
Model fine-tuning is the process of adapting a pre-trained LLM to a specific task or dataset. This helps the model learn domain-specific knowledge and improve its accuracy.

Methods for Model Fine-Tuning
Task-Specific Training Data: Fine-tuning a pre-trained LLM on task-specific data to help the model learn domain-specific knowledge.

Data Quality: Ensuring high-quality training data is used for fine-tuning.

Pre-Training Model Adaptation: Adapting a pre-trained LLM to a specific task or dataset.

Model Architecture: Choosing the right model architecture to maximize the effectiveness of fine-tuning.

Hyperparameter Tuning: Carefully tuning hyperparameters such as learning rate, batch size, and number of epochs to achieve high accuracy.

The quality of the training data directly impacts the performance of the fine-tuned model. High-quality data leads to better model performance, while low-quality data can result in suboptimal outcomes.

Additional Techniques
Regularization Techniques: Methods such as dropout and weight decay can be used to prevent overfitting during model fine-tuning, reducing the impact of noisy or irrelevant data.

Ensemble Methods: Techniques like bagging and boosting combine the predictions of multiple fine-tuned models, improving overall accuracy by reducing the impact of individual model errors.

Conclusion
Improving the accuracy of answers from Large Language Models (LLMs) requires a combination of data curation and model fine-tuning. By providing high-quality training data, adapting the weights and biases of a pre-trained model to fit a specific task or dataset, and using regularization techniques and ensemble methods to prevent overfitting and improve overall performance, researchers can create high-performing LLMs that are well-suited to specific tasks or datasets.

References
"Query Classification with Pre-trained Language Models" by H. Chen et al.

"Sentiment Analysis with Pre-trained Language Models" by J. Liu et al.

Confidence level: 0.95
```

-   Seems not bad, huh, for `llama3.2-3b` on m1 pro and context window of 8k tokens.

### The Gang

-   **Orchestrator Service**: The puppet master that breaks question into tiny pieces
-   **RAG Integration**: Because regular AI hallucinations weren't enough - now we hallucinate with _context_. (Qdrant storage, hybrid search - vector + Okapi BM25, reranked with colBERT)
-   **LM Studio Integration**: Because who in the current economy with a sane mind has 20$/month for chatgpt or perplexity?
-   **Retry Mechanism**: When confidence < 0.8, the AI basically goes "that's L fr, lemme cook again"

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

## How to Summon This Abomination

-   Node.js
-   LM Studio running locally (optionally you may get a sound of a rocket engine as a bonus - that's your cooler)
-   The patience of a saint
-   A strong wifi connection, stronger coffee, strongest weird will to play with this, LMAO

```bash
# clone the repo
# open the new folder
cd llm-reasoning
# Install dependencies (and half of the internet ofc)
npm install
# Copy the env file
cp .env.example .env
# start Qdrant in docker
docker run -p 6333:6333 -p 6334:6334 -v "$(pwd)/qdrant_storage:/qdrant/storage:z" qdrant/qdrant
```

### 3. Configuration

Edit your `.env` file with the following arcane knowledge:

```env
LM_STUDIO_URL=http://localhost:1234  # Where your AI overlord lives
PORT=3000                            # The port of no return
NODE_ENV=development                 # Because production is scary
```

### 4. Fire It Up

```bash
# Development mode (with hot reload because we're not savages)
npm run dev
```

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

-   `GET /api/health` - Check if the backend is still alive or just pretending

## Reasoning Strategies

The AI has four different ways to overcomplicate even the most simple question:

1. **Chain of Thought**

    - _What it does_: Thinks step-by-step like a very methodical civil servant that draws a map of cabinets and forms you have to visit and fulfill
    - _Best for_: Math problems, logical puzzles, "what happens if" scenarios

2. **Skeleton of Thought**

    - _What it does_: Creates an outline so detailed it could be a dissertation
    - _Best for_: When you need everything categorized and labeled

3. **Constrained Chain of Thought**

    - _What it does_: Thinks with handcuffs on (rules and limitations)
    - _Best for_: Legal stuff, compliance questions, "but what if there's a rule against that"

4. **Graph of Thoughts**
    - _What it does_: Connects everything to everything like a conspiracy theory (with similar outcomes)
    - _Best for_: Complex problems that need 42 different perspectives

## The Confidence Scoring

The retry system is basically digital gaslighting - we tell the AI its first answer wasn't good enough and make it try again with more context until it's confident or gives up.

## Console Log Spam

The orchestrator service logs literally everything, this feature was added with claude code (at least we found some feature it is good at). Cringe emoji included, glad you asked.

## Environment Variables (The Sacred Texts)

```env
LM_STUDIO_URL=http://localhost:1234  # Where the magic happens
PORT=3000                            # The gateway to backend hell
NODE_ENV=development                 # development (if you expect to run THIS in prod you may be a great candidate for the next joker movie instead of Hoakin Feniks, good luck)
```

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
