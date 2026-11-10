import { lazy } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { Layout } from '@/components/Layout'

const Home = lazy(() => import('@/features/home/HomePage'))
const Open = lazy(() => import('@/features/viewer/OpenPage'))
const Project = lazy(() => import('@/features/viewer/ProjectPage'))
const Build = lazy(() => import('@/features/configurator/BuildPage'))
const Projects = lazy(() => import('@/features/home/ProjectsPage'))
const Signals = lazy(() => import('@/features/reference/SignalsPage'))

// Hash routing → works on GitHub Pages with no server config.
const router = createHashRouter([{ path: '/', element: <Layout />, children: [
  { index: true, element: <Home /> },
  { path: 'open', element: <Open /> },
  { path: 'project/:id', element: <Project /> },
  { path: 'build', element: <Build /> },
  { path: 'projects', element: <Projects /> },
  { path: 'signals', element: <Signals /> },
  { path: '*', element: <Home /> },
] }])

export default function App() { return <RouterProvider router={router} /> }
