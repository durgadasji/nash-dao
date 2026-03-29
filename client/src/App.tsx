import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Simulator from "@/pages/Simulator";
import NotFound from "@/pages/not-found";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Simulator} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppRoutes />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
