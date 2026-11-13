/** A task parsed from one Markdown checkbox line. */
export interface Task {
  id: string;
  filePath: string;
  line: number;
  rawLine: string;
  title: string;
  titleOccurrence: number;
  done: boolean;
  start?: string;
  due?: string;
  tags: string[];
  group: string;
  source: 'kanban' | 'markdown';
  warning?: string;
}
