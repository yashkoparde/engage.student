/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity } from './types.js';

export const DEFAULT_ACTIVITIES: Record<string, Activity[]> = {
  'Web Engineering (CS302)': [
    {
      id: 'web-1',
      type: 'mcq',
      question: 'Which CSS layout system is specifically designed for single-dimensional layouts (either a row or a column) rather than two-dimensional ones?',
      options: [
        'CSS Grid Layout',
        'CSS Flexible Box Layout (Flexbox)',
        'Table-based Layout',
        'Float-based Positioning'
      ],
      correctAnswer: 'CSS Flexible Box Layout (Flexbox)',
      timeLimit: 20
    },
    {
      id: 'web-2',
      type: 'confusion',
      question: 'Lecture: Under-the-hood analysis of React 19 Concurrent Rendering & Fiber Reconciliation. Tap to indicate your current level of understanding of Fiber nodes and lane-based scheduling.',
      timeLimit: 45
    },
    {
      id: 'web-3',
      type: 'fastest_finger',
      question: 'FASTEST FINGER: What does HTML stand for? (Type the exact full name, e.g. HyperText Markup Language)',
      correctAnswer: 'Hypertext Markup Language',
      timeLimit: 15,
      fingerType: 'text'
    },
    {
      id: 'web-4',
      type: 'mcq',
      question: 'When optimizing frontend performance, which browser cache is managed programmatically via Service Workers?',
      options: [
        'HTTP Browser Cache',
        'Memory Cache',
        'Cache Storage API',
        'Local Storage'
      ],
      correctAnswer: 'Cache Storage API',
      timeLimit: 25
    },
    {
      id: 'web-5',
      type: 'fastest_finger',
      question: 'FASTEST FINGER: In which calendar year was JavaScript first officially created by Brendan Eich? (Enter the 4-digit numeric year)',
      correctAnswer: '1995',
      timeLimit: 12,
      fingerType: 'numeric'
    }
  ],
  'Quantum Mechanics (PHYS401)': [
    {
      id: 'qm-1',
      type: 'mcq',
      question: 'Which principle states that two identical fermions cannot occupy the same quantum state simultaneously?',
      options: [
        'Heisenberg Uncertainty Principle',
        'Pauli Exclusion Principle',
        'De Broglie Hypothesis',
        'Planck Radiation Postulate'
      ],
      correctAnswer: 'Pauli Exclusion Principle',
      timeLimit: 20
    },
    {
      id: 'qm-2',
      type: 'confusion',
      question: 'Lecture: Derivation of the time-dependent Schrödinger Wave Equation and probability densities in a finite potential well.',
      timeLimit: 60
    },
    {
      id: 'qm-3',
      type: 'fastest_finger',
      question: 'FASTEST FINGER: What is the elementary particle that acts as the quantum of the electromagnetic field? (One word)',
      correctAnswer: 'Photon',
      timeLimit: 15,
      fingerType: 'text'
    },
    {
      id: 'qm-4',
      type: 'mcq',
      question: 'In quantum computing, what is the physical phenomenon where two or more qubits become perfectly correlated, such that the state of one instantly dictates the state of another?',
      options: [
        'Quantum Superposition',
        'Quantum Decoherence',
        'Quantum Entanglement',
        'Quantum Tunneling'
      ],
      correctAnswer: 'Quantum Entanglement',
      timeLimit: 25
    }
  ],
  'Macroeconomics (ECON202)': [
    {
      id: 'econ-1',
      type: 'mcq',
      question: 'Which economic curve represents the relationship between tax rates and the total amount of tax revenue collected by the government?',
      options: [
        'Phillips Curve',
        'Laffer Curve',
        'Lorenz Curve',
        'Engel Curve'
      ],
      correctAnswer: 'Laffer Curve',
      timeLimit: 20
    },
    {
      id: 'econ-2',
      type: 'confusion',
      question: 'Lecture: Analyzing the IS-LM model and how central bank interest rate cuts shift the LM curve under liquid-trap conditions.',
      timeLimit: 45
    },
    {
      id: 'econ-3',
      type: 'fastest_finger',
      question: 'FASTEST FINGER: What is the standard annual target inflation rate (in %) targeted by major central banks like the Federal Reserve? (Type the single digit)',
      correctAnswer: '2',
      timeLimit: 15,
      fingerType: 'numeric'
    },
    {
      id: 'econ-4',
      type: 'mcq',
      question: 'What term describes a simultaneous combination of stagnant economic growth, high unemployment, and high price inflation?',
      options: [
        'Hyperinflation',
        'Stagflation',
        'Deflationary Spiral',
        'Dutch Disease'
      ],
      correctAnswer: 'Stagflation',
      timeLimit: 25
    }
  ],
  'Organic Chemistry (CHEM301)': [
    {
      id: 'chem-1',
      type: 'mcq',
      question: 'Which rule is used to predict the major regiochemical product of an electrophilic addition reaction to an unsymmetrical alkene?',
      options: [
        'Zaitsev Rule',
        'Markovnikov Rule',
        'Huckel Rule',
        'Hund Rule'
      ],
      correctAnswer: 'Markovnikov Rule',
      timeLimit: 20
    },
    {
      id: 'chem-2',
      type: 'confusion',
      question: 'Lecture: Stereochemical inversion in SN2 nucleophilic substitution mechanisms and orbital interactions.',
      timeLimit: 45
    },
    {
      id: 'chem-3',
      type: 'fastest_finger',
      question: 'FASTEST FINGER: What is the IUPAC name for the simplest organic compound containing a carbon-carbon triple bond?',
      correctAnswer: 'Ethyne',
      timeLimit: 15,
      fingerType: 'text'
    }
  ]
};
