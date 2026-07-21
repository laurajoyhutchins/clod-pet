package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBackendListenAddressIsLoopbackOnly(t *testing.T) {
	if got := backendListenAddress("8080"); got != "127.0.0.1:8080" {
		t.Fatalf("backend listen address = %q, want loopback-only address", got)
	}
}

func TestBackendHandlerDoesNotGrantCrossOriginAccess(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/health", nil)
	req.Header.Set("Origin", "https://untrusted.example")
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	rr := httptest.NewRecorder()
	recoveryMiddleware(mux).ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("unexpected Access-Control-Allow-Origin header %q", got)
	}
}

func TestVersionHandlerOmitsLocalPaths(t *testing.T) {
	rr := invokeHandler(t, versionHandler(), http.MethodGet, "/api/version", "")
	body := rr.Body.String()
	if containsAny(body, "pets_dir", "settings_path") {
		t.Fatalf("version response exposed local path metadata: %s", body)
	}
}

func containsAny(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if len(candidate) > 0 && len(value) >= len(candidate) {
			for i := 0; i+len(candidate) <= len(value); i++ {
				if value[i:i+len(candidate)] == candidate {
					return true
				}
			}
		}
	}
	return false
}
