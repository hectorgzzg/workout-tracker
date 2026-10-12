# Project Overview

## Introduction

This project is a full-stack JavaScript Workout tracker application to track user workout training plan using 1RM, RIR (Reps in Reserve), and the Rep range of the current plan to adpat the progressive overload of the user

## Architecture

The project follows a monorepo architecture with:

- `packages/frontend/`: Vue.js-based web application
- `packages/backend/`: Express.js API server

Testing coverage spans unit, integration, and UI end-to-end validation across frontend and backend behaviors.

## Technology Stack

### Frontend

- Vue.js, Pinia, Vue Router
- PrimeVue
- Playwright - UI end-to-end testing for critical user journeys
- ESLint for code quality

### Backend

- Node.js
- Express.js
- Jest and Supertest for testing
- ESLint for code quality

### Development Tools

- GitHub Actions for automated validation
- GitHub Codespaces for consistent development environment

### Hosting

- Github pages for Frontend Hosting
- Render.com for Backedn Hosting
- Neon.tech for Database Hosting

## Learning Workflow Pattern

Throughout this session, you'll practice:

1. **Test-Driven Development (TDD)**
   - Run tests → See failures → Fix code → Rerun tests → Iterate

2. **Compilation/Lint Loops**
   - Run lint → See errors → Fix issues → Re-lint → Iterate

3. **Implementation Cycles**
   - Plan feature → Build incrementally → Test → Debug → Repeat

4. **Integration Validation**
   - Run app → Test manually → Fix bugs → Retest → Iterate

5. **UI Test Automation**
   - Define critical journeys → Automate browser tests → Run → Debug failures/flakiness → Stabilize

## Getting Started

### Running the Application

```bash
# Start both frontend and backend
npm run start

# Run tests for all packages
npm test

# Run linting
npm run lint

# Run UI end-to-end tests
npm run test:ui
```
