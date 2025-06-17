# @elizaos/plugin-todo

A production-ready TODO list management plugin for Eliza agents that provides task creation, tracking, and completion capabilities with points and streak systems. Features a custom database schema using Drizzle ORM for reliable data persistence.

## Features

- **Custom Database Schema**: Dedicated tables for todos, tags, points, and streaks using Drizzle ORM
- **Task Types**: Support for daily, one-off, and aspirational tasks
- **Points System**: Earn points for completing tasks based on priority and timeliness
- **Streak Tracking**: Track completion streaks for daily tasks with automatic reset
- **Smart Reminders**: Automatic reminders for overdue tasks
- **Natural Language**: Create and manage tasks through conversation
- **Flexible Updates**: Modify task details, priorities, and due dates
- **Tag System**: Normalized tag storage with automatic tagging based on task attributes
- **Data Service Layer**: Clean API through TodoDataService for all database operations
- **Frontend Support**: Web interface for viewing and managing todos
- **Comprehensive Testing**: Unit tests with Vitest and E2E tests with Cypress

## Installation

```bash
npm install @elizaos/plugin-todo
```

## Usage

### Adding to Your Eliza Agent

```typescript
import { TodoPlugin } from '@elizaos/plugin-todo';

const agent = new Agent({
  plugins: [TodoPlugin],
  // ... other configuration
});
```

### Configuration

The plugin requires database support through Drizzle ORM. It will automatically create the required tables:
- `todos` - Main todo items
- `todo_tags` - Normalized tag storage
- `user_points` - Points tracking per user/room/world
- `point_history` - Complete audit trail for points
- `daily_streaks` - Streak tracking for daily todos

### Available Actions

#### CREATE_TODO
Create new tasks through natural conversation:
- "Add a daily task to exercise"
- "Create a todo to finish the report by Friday with high priority"
- "I want to learn Spanish someday" (creates aspirational task)

#### COMPLETE_TODO
Mark tasks as completed:
- "Complete my exercise task"
- "I finished the report"
- "Mark my Spanish learning as done"

#### UPDATE_TODO
Modify existing tasks:
- "Change the report deadline to next Monday"
- "Make the exercise task urgent"
- "Update Spanish learning to daily task"

#### CANCEL_TODO
Remove tasks:
- "Cancel the report task"
- "Delete my exercise todo"
- "Remove Spanish learning from my list"

### Task Types

1. **Daily Tasks**
   - Reset automatically each day
   - Track completion streaks
   - Earn bonus points for maintaining streaks

2. **One-off Tasks**
   - Single completion tasks
   - Support priorities (1-4) and due dates
   - Points based on priority and timeliness

3. **Aspirational Tasks**
   - Long-term goals without due dates
   - Fixed points for completion

### Points System

Points are calculated based on:
- Task type and priority
- Completion timeliness (on-time vs late)
- Streak bonuses for daily tasks

Example calculations:
- Daily task: 10 points + streak bonus
- Priority 1 task: 20 points (on-time) / 10 points (late)
- Priority 4 task: 5 points (on-time) / 2 points (late)
- Aspirational task: 50 points

## Development

### Prerequisites

```bash
# Install dependencies
npm install

# Build the plugin
npm run build
```

### Running Tests

```bash
# Run unit tests
npm run test:unit

# Run E2E tests (requires running Eliza server)
npm run test:e2e

# Run all tests
npm test
```

### Project Structure

```
plugin-todo/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── schema.ts             # Database schema definitions
│   ├── actions/              # Action handlers
│   │   ├── createTodo.ts
│   │   ├── completeTodo.ts
│   │   ├── updateTodo.ts
│   │   └── cancelTodo.ts
│   ├── services/
│   │   ├── todoDataService.ts    # Main data access layer
│   │   └── dbCompatibility.ts    # Database compatibility layer
│   ├── providers/
│   │   └── todos.ts          # Todo provider for agent context
│   ├── apis.ts               # REST API endpoints
│   └── frontend/             # Web UI components
├── cypress/                  # E2E tests
└── src/tests/               # Unit tests
```

### API Endpoints

The plugin provides REST API endpoints when the agent is running:

- `GET /api/todos` - Get all todos structured by world and room
- `POST /api/todos` - Create a new todo
- `PUT /api/todos/:id` - Update a todo
- `PUT /api/todos/:id/complete` - Complete a todo
- `DELETE /api/todos/:id` - Delete a todo
- `GET /api/points/:entityId` - Get user points
- `GET /api/tags` - Get all unique tags

## Contributing

Contributions are welcome! Please ensure:
1. All tests pass
2. Code follows the existing style
3. New features include tests
4. Documentation is updated

## License

MIT

## Support

For issues and feature requests, please use the GitHub issue tracker.
