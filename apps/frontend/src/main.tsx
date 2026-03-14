import { HeroUIProvider } from "@heroui/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router"
import App from "./App"
import "./index.css"
import { queryClient, trpc, trpcClient } from "./trpc"

document.documentElement.classList.add("dark")
document.documentElement.style.colorScheme = "dark"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HeroUIProvider>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </trpc.Provider>
      </QueryClientProvider>
    </HeroUIProvider>
  </StrictMode>,
)
