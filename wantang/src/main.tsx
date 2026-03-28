import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// DEBUG: 暴露 store 到控制台（测试完删掉）
import { useCharacterStore } from '@engine/character/CharacterStore'
import { useTerritoryStore } from '@engine/territory/TerritoryStore'
import { useTurnManager } from '@engine/TurnManager'
import { useNpcStore } from '@engine/npc/NpcStore'
import { runReview } from '@engine/npc/behaviors/reviewBehavior'
Object.assign(window, { useCharacterStore, useTerritoryStore, useTurnManager, useNpcStore, runReview })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
