import { Button, Input } from "@heroui/react"
import { useState } from "react"
import { Navigate, Route, Routes } from "react-router"
import { DashboardPage } from "./pages/dashboard-page"
import { getAdminToken, setAdminToken } from "./trpc"

function AdminTokenGate() {
  const [token, setToken] = useState("")

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold">Admin Token Required</h1>
        <p className="mt-2 text-sm text-white/70">
          This dashboard now requires the AgentSwarm admin token before any worker
          data is loaded.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const nextToken = token.trim()

            if (!nextToken) {
              return
            }

            setAdminToken(nextToken)
            window.location.reload()
          }}
        >
          <Input
            autoFocus
            label="Admin token"
            onValueChange={setToken}
            placeholder="Paste AGENTSWARM_ADMIN_TOKEN"
            type="password"
            value={token}
          />
          <Button className="w-full" color="primary" type="submit">
            Unlock dashboard
          </Button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  if (!getAdminToken()) {
    return <AdminTokenGate />
  }

  return (
    <Routes>
      <Route path="/:id?" element={<DashboardPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
