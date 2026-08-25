const KEY = 'simgov-tours-completed';

export function useTourCompletion() {
  const getCompleted = (): string[] =>
    JSON.parse(localStorage.getItem(KEY) || '[]');

  const isCompleted = (id: string) => getCompleted().includes(id);

  const markCompleted = (id: string) => {
    const updated = [...new Set([...getCompleted(), id])];
    localStorage.setItem(KEY, JSON.stringify(updated));
  };

  return { isCompleted, markCompleted };
}
