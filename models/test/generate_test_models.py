#!/usr/bin/env python3
"""
Generate Test ONNX Models

Creates minimal ONNX models for testing inference infrastructure.
Requires: pip install onnx numpy onnxruntime
"""

import numpy as np
import onnx
from onnx import helper, TensorProto
import os


def create_identity_model():
    """
    Create a simple identity model that outputs its input unchanged.
    Useful for testing infrastructure without computation overhead.
    """
    # Define input and output
    input_tensor = helper.make_tensor_value_info(
        'input', TensorProto.FLOAT, [1, 10]
    )
    output_tensor = helper.make_tensor_value_info(
        'output', TensorProto.FLOAT, [1, 10]
    )

    # Identity node
    identity_node = helper.make_node(
        'Identity',
        inputs=['input'],
        outputs=['output'],
        name='identity'
    )

    # Create graph
    graph = helper.make_graph(
        [identity_node],
        'identity-model',
        [input_tensor],
        [output_tensor]
    )

    # Create model
    model = helper.make_model(graph, producer_name='test-model-generator')
    model.opset_import[0].version = 13

    # Validate and save
    onnx.checker.check_model(model)
    onnx.save(model, 'identity.onnx')
    print('✓ Created identity.onnx')


def create_random_embedding_model():
    """
    Create a simple embedding model with random weights.
    Input: [1, sequence_length] (token IDs)
    Output: [1, embedding_dim] (embeddings)
    """
    vocab_size = 1000
    embedding_dim = 384

    # Random embedding weights
    weights = np.random.randn(vocab_size, embedding_dim).astype(np.float32)
    weights_tensor = helper.make_tensor(
        'embedding_weights',
        TensorProto.FLOAT,
        [vocab_size, embedding_dim],
        weights.flatten().tolist()
    )

    # Define input (token IDs as int64)
    input_tensor = helper.make_tensor_value_info(
        'input_ids', TensorProto.INT64, [1, None]
    )

    # Define output (embeddings)
    output_tensor = helper.make_tensor_value_info(
        'embeddings', TensorProto.FLOAT, [1, embedding_dim]
    )

    # Gather node to lookup embeddings
    gather_node = helper.make_node(
        'Gather',
        inputs=['embedding_weights', 'input_ids'],
        outputs=['gathered'],
        axis=0
    )

    # ReduceMean to average embeddings
    reduce_node = helper.make_node(
        'ReduceMean',
        inputs=['gathered'],
        outputs=['embeddings'],
        axes=[1],
        keepdims=0
    )

    # Create graph
    graph = helper.make_graph(
        [gather_node, reduce_node],
        'random-embedding-model',
        [input_tensor],
        [output_tensor],
        [weights_tensor]
    )

    # Create model
    model = helper.make_model(graph, producer_name='test-model-generator')
    model.opset_import[0].version = 13

    # Validate and save
    onnx.checker.check_model(model)
    onnx.save(model, 'random-embeddings.onnx')
    print('✓ Created random-embeddings.onnx')


def create_simple_classifier():
    """
    Create a simple linear classifier.
    Input: [1, input_dim] (features)
    Output: [1, num_classes] (logits)
    """
    input_dim = 384
    num_classes = 3

    # Random weights and bias
    weights = np.random.randn(input_dim, num_classes).astype(np.float32)
    bias = np.random.randn(num_classes).astype(np.float32)

    weights_tensor = helper.make_tensor(
        'weights',
        TensorProto.FLOAT,
        [input_dim, num_classes],
        weights.flatten().tolist()
    )

    bias_tensor = helper.make_tensor(
        'bias',
        TensorProto.FLOAT,
        [num_classes],
        bias.flatten().tolist()
    )

    # Define input and output
    input_tensor = helper.make_tensor_value_info(
        'features', TensorProto.FLOAT, [1, input_dim]
    )
    output_tensor = helper.make_tensor_value_info(
        'logits', TensorProto.FLOAT, [1, num_classes]
    )

    # MatMul node
    matmul_node = helper.make_node(
        'MatMul',
        inputs=['features', 'weights'],
        outputs=['matmul_out']
    )

    # Add bias
    add_node = helper.make_node(
        'Add',
        inputs=['matmul_out', 'bias'],
        outputs=['logits']
    )

    # Create graph
    graph = helper.make_graph(
        [matmul_node, add_node],
        'simple-classifier',
        [input_tensor],
        [output_tensor],
        [weights_tensor, bias_tensor]
    )

    # Create model
    model = helper.make_model(graph, producer_name='test-model-generator')
    model.opset_import[0].version = 13

    # Validate and save
    onnx.checker.check_model(model)
    onnx.save(model, 'simple-classifier.onnx')
    print('✓ Created simple-classifier.onnx')


def main():
    print("Generating ONNX test models...")
    print()

    create_identity_model()
    create_random_embedding_model()
    create_simple_classifier()

    print()
    print("✓ All test models generated successfully!")
    print()
    print("Models created:")
    print("  • identity.onnx - Simple identity model for testing")
    print("  • random-embeddings.onnx - Random embedding model")
    print("  • simple-classifier.onnx - Simple linear classifier")
    print()
    print("File sizes:")
    for filename in ['identity.onnx', 'random-embeddings.onnx', 'simple-classifier.onnx']:
        if os.path.exists(filename):
            size = os.path.getsize(filename)
            print(f"  • {filename}: {size:,} bytes")


if __name__ == '__main__':
    main()
