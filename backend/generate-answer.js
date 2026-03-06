const {ChatOpenAi}= require('langchain/openai');
    async function generateAnswer(query, retrieveChunks){
        const llm = new ChatOpenAi({
            modelName: "gpt-4o-mini",
        });
        const context = retrieveChunks.join('');
        const systemMessage = `You are an AI that answers questions strictly based on the provided context. 
  If the context doesn't contain enough information, respond with "I do not have enough info to answer this question."`;
        const userMessage = 'Context: ' + context + '\n\nQuestion: ' + query;
        const response = await llm.invoke([
            ["system", systemMessage],
            ["user", userMessage]
        ]);
        const answer = response.content.trim();
        return answer;


    }
