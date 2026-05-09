package main

import (
	"os"
	"strings"
	"testing"

	"clod-pet/backend/internal/ipc"

	"gopkg.in/yaml.v3"
)

func TestAPISpecCommandsMatchIPC(t *testing.T) {
	data, err := os.ReadFile("api-spec.yaml")
	if err != nil {
		t.Fatalf("read api spec: %v", err)
	}

	var spec map[string]interface{}
	if err := yaml.Unmarshal(data, &spec); err != nil {
		t.Fatalf("parse api spec: %v", err)
	}

	schemas := yamlMap(t, yamlMap(t, spec, "components"), "schemas")
	commandRequest := yamlMap(t, schemas, "ApiCommandRequest")
	oneOf := yamlSlice(t, commandRequest, "oneOf")

	gotCommands := make([]string, 0, len(oneOf))
	for _, item := range oneOf {
		ref := yamlStringValue(t, item, "$ref")
		const schemaRefPrefix = "#/components/schemas/"
		if !strings.HasPrefix(ref, schemaRefPrefix) {
			t.Fatalf("unexpected schema ref %q", ref)
		}
		schemaName := strings.TrimPrefix(ref, schemaRefPrefix)
		schema := yamlMap(t, schemas, schemaName)
		properties := yamlMap(t, schema, "properties")
		command := yamlMap(t, properties, "command")
		enum := yamlSlice(t, command, "enum")
		if len(enum) != 1 {
			t.Fatalf("%s command enum has %d values, want 1", schemaName, len(enum))
		}
		commandName, ok := enum[0].(string)
		if !ok {
			t.Fatalf("%s command enum has type %T, want string", schemaName, enum[0])
		}
		gotCommands = append(gotCommands, commandName)
	}

	wantCommands := ipc.Commands()
	if len(gotCommands) != len(wantCommands) {
		t.Fatalf("spec has %d commands, ipc has %d", len(gotCommands), len(wantCommands))
	}
	for i, want := range wantCommands {
		if gotCommands[i] != string(want) {
			t.Fatalf("command %d = %q, want %q", i, gotCommands[i], want)
		}
	}

	mapping := yamlMap(t, yamlMap(t, commandRequest, "discriminator"), "mapping")
	for _, command := range wantCommands {
		if _, ok := mapping[string(command)]; !ok {
			t.Fatalf("discriminator mapping missing command %q", command)
		}
	}
}

func yamlMap(t *testing.T, m map[string]interface{}, key string) map[string]interface{} {
	t.Helper()

	value, ok := m[key]
	if !ok {
		t.Fatalf("missing key %q", key)
	}
	result, ok := value.(map[string]interface{})
	if !ok {
		t.Fatalf("%q has type %T, want map[string]interface{}", key, value)
	}
	return result
}

func yamlSlice(t *testing.T, m map[string]interface{}, key string) []interface{} {
	t.Helper()

	value, ok := m[key]
	if !ok {
		t.Fatalf("missing key %q", key)
	}
	result, ok := value.([]interface{})
	if !ok {
		t.Fatalf("%q has type %T, want []interface{}", key, value)
	}
	return result
}

func yamlMapValue(t *testing.T, value interface{}, key string) interface{} {
	t.Helper()

	m, ok := value.(map[string]interface{})
	if !ok {
		t.Fatalf("value has type %T, want map[string]interface{}", value)
	}
	result, ok := m[key]
	if !ok {
		t.Fatalf("missing key %q", key)
	}
	return result
}

func yamlStringValue(t *testing.T, value interface{}, key string) string {
	t.Helper()

	raw := yamlMapValue(t, value, key)
	result, ok := raw.(string)
	if !ok {
		t.Fatalf("%q has type %T, want string", key, raw)
	}
	return result
}
