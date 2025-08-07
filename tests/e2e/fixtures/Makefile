# Makefile for memory-eater test utility

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -O2
TARGET = memory-eater
SOURCE = memory-eater.c

# Default target
$(TARGET): $(SOURCE)
	$(CC) $(CFLAGS) -o $(TARGET) $(SOURCE)
	@echo "Built $(TARGET) successfully"
	@echo "Usage: ./$(TARGET) <delay_seconds> <target_memory_mb>"
	@echo "Example: ./$(TARGET) 2 25"

# Clean target
clean:
	rm -f $(TARGET)
	@echo "Cleaned $(TARGET)"

# Test target (build and run a quick test)
test: $(TARGET)
	@echo "Running quick test (2 seconds delay, 10MB memory)..."
	@timeout 10s ./$(TARGET) 2 10 || true
	@echo "Test completed"

.PHONY: clean test