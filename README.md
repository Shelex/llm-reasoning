# SLM Reasoning Backend

**TL;DR**: Backend for opinionatedly enhanced local llm that thinks so hard it might immediately regret it.

A TypeScript backend that's basically like giving your LLM a PhD in overthinking, complete with existential crisis detection and automatic retry mechanisms when the AI gets confused about its own intelligence.

## What This Cursed Thing Actually Does

This abomination of code takes your innocent little questions and puts them through a meat grinder of reasoning (LMAO) strategies. It's like having a very anxious AI assistant that second-guesses itself so much it takes an eternity to get something out of it.

## Example
- M1 Pro, 16GB RAM
- LM Studio: `llama-3.2-3b-instruct` Q4_K_S GGUF (1.93 Gb), context window of 4k tokens.
- started dev server
- created chat POST /api/chat/create
```json
{
    "chatId": "73d01f65-758f-48a6-9261-6e41460e13b5",
    "status": "created"
}
```
- sent the question via api:
```
{
    "reason": true,
    "query": "What are the ways to improve the accuracy of answers from LLM?"
}
```

- logs:
```
🚀 [ORCHESTRATOR] Starting query processing for chatId: 73d01f65-758f-48a6-9261-6e41460e13b5
📋 [ORCHESTRATOR] Query: What are the ways to improve the accuracy of answers from LLM?
🔍 [ORCHESTRATOR] Stage 1: Decomposing query
🔨 [ORCHESTRATOR] Decomposing query into subtasks
✅ [ORCHESTRATOR] Query decomposed into 4 subtasks
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 1: What are some common techniques used to fine-tune LLM models for improved accuracy?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: chain_of_thought for subtask 1
⚡ [ORCHESTRATOR] Executing subtask 1 with strategy chain_of_thought
📚 [ORCHESTRATOR] Retrieved 1 context items for subtask 1
🎯 [ORCHESTRATOR] Executing chain_of_thought strategy for subtask 1
📊 [ORCHESTRATOR] Subtask 1 completed with confidence: 0.65
🔄 [ORCHESTRATOR] Confidence 0.65 below threshold 0.8 for subtask 1, attempting retry
🔄 [ORCHESTRATOR] Creating retry prompt for subtask 1
📚 [ORCHESTRATOR] Retrieved 2 additional context items for retry
🎯 [ORCHESTRATOR] Executing retry attempt for subtask 1
📈 [ORCHESTRATOR] Retry completed - Original confidence: 0.65, New confidence: 0.95
✅ [ORCHESTRATOR] Retry successful for subtask 1, new confidence: 0.95
✅ [ORCHESTRATOR] Subtask 1 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 2: How do data preprocessing and feature engineering impact the accuracy of LLM answers?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: graph_of_thoughts for subtask 2
⚡ [ORCHESTRATOR] Executing subtask 2 with strategy graph_of_thoughts
📚 [ORCHESTRATOR] Retrieved 2 context items for subtask 2
🎯 [ORCHESTRATOR] Executing graph_of_thoughts strategy for subtask 2
📊 [ORCHESTRATOR] Subtask 2 completed with confidence: 0.92
✅ [ORCHESTRATOR] Subtask 2 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 3: What is the effect of model size on the accuracy of LLM answers, and what are some common trade-offs?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: chain_of_thought for subtask 3
⚡ [ORCHESTRATOR] Executing subtask 3 with strategy chain_of_thought
📚 [ORCHESTRATOR] Retrieved 3 context items for subtask 3
🎯 [ORCHESTRATOR] Executing chain_of_thought strategy for subtask 3
📊 [ORCHESTRATOR] Subtask 3 completed with confidence: 0.9
✅ [ORCHESTRATOR] Subtask 3 completed
🎯 [ORCHESTRATOR] Stage 2: Processing subtask 4: How do different training objectives (e.g. masked language modeling, next sentence prediction) impact the accuracy of LLM answers?
🤔 [ORCHESTRATOR] Selecting reasoning strategy for query
🧠 [ORCHESTRATOR] Selected strategy: graph_of_thoughts for subtask 4
⚡ [ORCHESTRATOR] Executing subtask 4 with strategy graph_of_thoughts
📚 [ORCHESTRATOR] Retrieved 3 context items for subtask 4
🎯 [ORCHESTRATOR] Executing graph_of_thoughts strategy for subtask 4
📊 [ORCHESTRATOR] Subtask 4 completed with confidence: 0.92
✅ [ORCHESTRATOR] Subtask 4 completed
📝 [ORCHESTRATOR] Stage 3: Synthesizing final answer from 4 subtask results
🔄 [ORCHESTRATOR] Stage 3a: Synthesizing raw answer
🔗 [ORCHESTRATOR] Retrieving relevant context for final synthesis
📖 [ORCHESTRATOR] Retrieved 2 context items for final synthesis
✨ [ORCHESTRATOR] Stage 3b: Beautifying answer
🎨 [ORCHESTRATOR] Answer beautification completed
🎉 [ORCHESTRATOR] Query processing completed successfully
```
- answer:
```text
Improving the accuracy of answers from Large Language Models (LLMs) is an area of ongoing research, and it requires a combination of various techniques. Let's break down some of the key strategies that can help.
First and foremost, data preprocessing plays a crucial role in improving LLM accuracy. This involves handling missing values, removing noise, tokenizing text, and converting data into a suitable format for LLMs. A study published in the Journal of Artificial Intelligence Research found that even small improvements in data preprocessing can lead to significant gains in model performance (Chen et al., 2020). For example, the Hugging Face team demonstrated a 10% increase in accuracy after applying a set of preprocessing techniques (Devlin et al., 2019).
So, what are some common data preprocessing techniques? Well, there's tokenization, which is the process of breaking text into individual words or tokens. Then there's stopwords removal, where you remove common words like "the" and "and" that don't add much value to the meaning of the text. And finally, there's stemming or lemmatization, which reduces words to their base form to reduce dimensionality.
Feature engineering is another critical aspect of LLM development. This involves designing and selecting features that are relevant to the problem at hand. For LLMs, this means identifying the most informative input features that can help the model understand the context and generate accurate answers. Research has shown that feature engineering is essential for improving performance (Peng et al., 2019). Techniques like embedding extraction, which represents text data in a more compact and meaningful way, or named entity recognition (NER), which identifies entities like people, places, and organizations, can lead to significant gains in model accuracy.
Fine-tuning LLM models is another key strategy. This involves adjusting the model's parameters to fit a specific task or dataset. Techniques like knowledge distillation, where you transfer knowledge from a larger pre-trained model to a smaller one, or weight sharing, which reduces the number of parameters in the neural network by reusing weights across different layers or models, can be effective (Keskar et al., 2016). Regularization techniques like dropout and weight decay also help prevent overfitting.
Data augmentation and generation are also important for improving model performance. These techniques involve increasing the size of the training dataset through synthetic data generation or transfer learning from other tasks or domains. This can lead to significant gains in accuracy, especially when combined with fine-tuning models (Huang et al., 2020).
Of course, the choice of model size is also critical. Larger models tend to perform better than smaller ones, but there's a point of diminishing returns where further increasing the model size doesn't lead to significant improvements in accuracy.
Finally, the choice of training objective can significantly impact the accuracy of LLM answers. Common objectives include masked language modeling, next sentence prediction, and self-supervised learning. Each of these objectives has its own strengths and weaknesses, and researchers are continually exploring new techniques to improve performance.
In conclusion, improving the accuracy of LLM answers requires a combination of various techniques, including data preprocessing, feature engineering, fine-tuning models, and optimization algorithms. By understanding the different strategies that can be used, we can develop more accurate and effective LLMs for a wide range of applications.
References:
Chen, T. Q., et al. (2020). Preprocessing for large language models. Journal of Artificial Intelligence Research, 67, 1-25.
Devlin, J., et al. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. arXiv preprint arXiv:1902.03855"
Peng, L., et al. (2019). Feature engineering for large language models. Journal of Machine Learning Research, 20, 1-30.
Keskar, N., et al. (2016). On the effectiveness of knowledge distillation. Proceedings of the International Conference on Artificial Intelligence and Statistics, 47-56.
Huang, X., et al. (2020). Model size matters: An empirical study on the impact of model size on language modeling performance. arXiv preprint arXiv:2003.04455"
```

- Seems not bad, huh, for `llama-3.2-3b-instruct` (1.93Gb) on m1 pro and context window of 4k tokens.

### The Gang

-   **Orchestrator Service**: The puppet master that breaks question into tiny pieces
-   **RAG Integration**: Because regular AI hallucinations weren't enough - now we hallucinate with _context_
-   **LM Studio Integration**: Because who in the current economy with a sane mind has 20$/month for chatgpt or perplexity?
-   **Retry Mechanism**: When confidence < 0.8, the AI basically goes "that's L fr, lemme cook again"

## How to Summon This Abomination

-   Node.js
-   LM Studio running locally (optionally you may get a sound of a rocket engine as a bonus - that's your cooler)
-   The patience of a saint
-   A strong wifi connection, stronger coffee, strongest weird will to play with this, LMAO

```bash
# clone the repo
# open the new folder
cd slm-reasoning
# Install dependencies (and half of the internet ofc)
npm install
# Copy the env file
cp .env.example .env
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
