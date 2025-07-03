export class ResponseFilter {
    static filterThinkBlocks(content: string): string {
        if (!content || typeof content !== "string") {
            return content;
        }

        const filtered = content.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "");

        const cleanedUp = filtered
            .replace(/<\/think>/gi, "")
            .replace(/<think[^>]*>/gi, "")
            .trim();

        return cleanedUp.replace(/\n\s*\n\s*\n/g, "\n\n");
    }
}
