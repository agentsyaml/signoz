export function getScoreClassName(score: number): string {
	if (score >= 0.8) {
		return 'llm-retriever-doc__score--high';
	}
	if (score >= 0.5) {
		return 'llm-retriever-doc__score--med';
	}
	return 'llm-retriever-doc__score--low';
}
