//! xAI 400s the whole turn when a tool root is `type: object` plus a typeless
//! exclusive-required `anyOf`/`oneOf`. Flatten only that root fragment.
//! Nested unions stay intact. A leftover object-root union drops that one tool.

use serde_json::{Map, Value};

pub(crate) fn prepare_xai_tools(tools: Vec<Value>) -> Vec<Value> {
    tools
        .into_iter()
        .filter_map(|mut tool| {
            let parameters = tool
                .get_mut("function")
                .and_then(Value::as_object_mut)
                .and_then(|function| function.get_mut("parameters"))?;
            let Some(schema) = parameters.as_object_mut() else {
                return Some(tool);
            };
            flatten_exclusive_required_union(schema);
            if has_xai_root_object_union(schema) {
                return None;
            }
            Some(tool)
        })
        .collect()
}

fn flatten_exclusive_required_union(schema: &mut Map<String, Value>) {
    let union_key = if schema.get("anyOf").and_then(Value::as_array).is_some() {
        "anyOf"
    } else if schema.get("oneOf").and_then(Value::as_array).is_some() {
        "oneOf"
    } else {
        return;
    };
    let Some(union) = schema.get(union_key).and_then(Value::as_array) else {
        return;
    };
    if union.is_empty() || !union.iter().all(is_exclusive_required_branch) {
        return;
    }
    let typed_object = schema.get("type").is_some_and(|value| {
        value.as_str() == Some("object")
            || value
                .as_array()
                .is_some_and(|types| types.iter().any(|item| item.as_str() == Some("object")))
    });
    if !typed_object && !schema.get("properties").is_some_and(Value::is_object) {
        return;
    }
    schema.remove(union_key);
}

fn is_exclusive_required_branch(branch: &Value) -> bool {
    let Some(branch) = branch.as_object() else {
        return false;
    };
    if branch.contains_key("type") {
        return false;
    }
    let Some(required) = branch.get("required").and_then(Value::as_array) else {
        return false;
    };
    if required.is_empty()
        || !required
            .iter()
            .all(|name| name.as_str().is_some_and(|name| !name.is_empty()))
    {
        return false;
    }
    branch
        .keys()
        .all(|key| matches!(key.as_str(), "required" | "description" | "title"))
}

fn has_xai_root_object_union(schema: &Map<String, Value>) -> bool {
    let types = declared_types(schema);
    if !types.iter().any(|kind| kind == "object")
        && !schema.get("properties").is_some_and(Value::is_object)
    {
        return false;
    }
    for key in ["anyOf", "oneOf"] {
        let Some(branches) = schema.get(key).and_then(Value::as_array) else {
            continue;
        };
        if branches.is_empty() {
            continue;
        }
        let has_non_object = branches.iter().any(|branch| {
            let Some(branch) = branch.as_object() else {
                return true;
            };
            !declared_types(branch).iter().any(|kind| kind == "object")
        });
        if has_non_object {
            return true;
        }
    }
    false
}

fn declared_types(node: &Map<String, Value>) -> Vec<String> {
    match node.get("type") {
        Some(Value::String(kind)) => vec![kind.clone()],
        Some(Value::Array(kinds)) => kinds
            .iter()
            .filter_map(|kind| kind.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tool(parameters: Value) -> Value {
        json!({
            "type": "function",
            "function": { "name": "pair", "description": "pair", "parameters": parameters }
        })
    }

    #[test]
    fn flattens_exclusive_required_root_and_drops_a_real_union() {
        let flattened = prepare_xai_tools(vec![tool(json!({
            "type": "object",
            "properties": { "a": { "type": "string" }, "b": { "type": "string" } },
            "anyOf": [{ "required": ["a"] }, { "required": ["b"] }]
        }))]);
        assert_eq!(flattened.len(), 1);
        assert!(flattened[0]["function"]["parameters"]
            .get("anyOf")
            .is_none());

        let dropped = prepare_xai_tools(vec![tool(json!({
            "type": "object",
            "properties": {},
            "anyOf": [{ "type": "object" }, { "type": "string" }]
        }))]);
        assert!(dropped.is_empty());
    }
}
