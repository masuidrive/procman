/**
 * Memory eater process for testing memory limit functionality
 * Usage: ./memory-eater <delay_seconds> <target_memory_mb>
 * 
 * This process waits for delay_seconds, then rapidly consumes target_memory_mb
 * of memory to trigger max_memory_restart in a predictable manner.
 */

#define _DEFAULT_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sys/time.h>
#include <time.h>

volatile int should_exit = 0;
char **memory_chunks = NULL;
int chunk_count = 0;

void signal_handler(int sig) {
    printf("[C-MemEater] Received signal %d, cleaning up...\n", sig);
    should_exit = 1;
}

void cleanup_memory() {
    if (memory_chunks) {
        for (int i = 0; i < chunk_count; i++) {
            if (memory_chunks[i]) {
                free(memory_chunks[i]);
            }
        }
        free(memory_chunks);
        memory_chunks = NULL;
        chunk_count = 0;
    }
    printf("[C-MemEater] Memory cleaned up\n");
}

void print_memory_usage() {
    FILE *file = fopen("/proc/self/status", "r");
    if (file) {
        char line[128];
        while (fgets(line, sizeof(line), file)) {
            if (strncmp(line, "VmRSS:", 6) == 0) {
                printf("[C-MemEater] Current RSS: %s", line + 6);
                break;
            }
        }
        fclose(file);
    }
}

int main(int argc, char *argv[]) {
    if (argc != 3) {
        fprintf(stderr, "Usage: %s <delay_seconds> <target_memory_mb>\n", argv[0]);
        fprintf(stderr, "Example: %s 2 25\n", argv[0]);
        return 1;
    }

    int delay_seconds = atoi(argv[1]);
    int target_memory_mb = atoi(argv[2]);
    
    if (delay_seconds <= 0 || target_memory_mb <= 0) {
        fprintf(stderr, "Error: delay_seconds and target_memory_mb must be positive integers\n");
        return 1;
    }
    
    // Safety limit to prevent system crashes
    const int MAX_MEMORY_MB = 100;
    if (target_memory_mb > MAX_MEMORY_MB) {
        fprintf(stderr, "Warning: Requested %dMB exceeds safety limit of %dMB\n", target_memory_mb, MAX_MEMORY_MB);
        fprintf(stderr, "Limiting to %dMB to prevent system crashes\n", MAX_MEMORY_MB);
        target_memory_mb = MAX_MEMORY_MB;
    }

    printf("[C-MemEater] Starting with PID: %d\n", getpid());
    printf("[C-MemEater] Will consume %dMB after %d seconds\n", target_memory_mb, delay_seconds);

    // Set up signal handlers
    signal(SIGTERM, signal_handler);
    signal(SIGINT, signal_handler);

    // Initial memory usage
    print_memory_usage();

    // Wait for specified delay
    printf("[C-MemEater] Waiting %d seconds before consuming memory...\n", delay_seconds);
    for (int i = 0; i < delay_seconds && !should_exit; i++) {
        sleep(1);
        printf("[C-MemEater] Waiting... %d/%d seconds\n", i + 1, delay_seconds);
    }

    if (should_exit) {
        printf("[C-MemEater] Received exit signal during wait, exiting cleanly\n");
        return 0;
    }

    // Calculate memory allocation
    size_t chunk_size = 1024 * 1024; // 1MB per chunk
    int chunks_needed = target_memory_mb;
    
    printf("[C-MemEater] Starting memory consumption: %d chunks of 1MB each\n", chunks_needed);
    
    // Allocate array to hold chunk pointers
    memory_chunks = malloc(chunks_needed * sizeof(char*));
    if (!memory_chunks) {
        fprintf(stderr, "[C-MemEater] Failed to allocate chunk pointer array\n");
        return 1;
    }

    // Consume memory rapidly
    for (int i = 0; i < chunks_needed && !should_exit; i++) {
        memory_chunks[i] = malloc(chunk_size);
        if (!memory_chunks[i]) {
            fprintf(stderr, "[C-MemEater] Failed to allocate chunk %d\n", i);
            break;
        }
        
        // Fill memory to ensure it's actually allocated (avoid lazy allocation)
        memset(memory_chunks[i], 0xAA, chunk_size);
        chunk_count = i + 1;
        
        printf("[C-MemEater] Allocated chunk %d/%d (%dMB total)\n", 
               i + 1, chunks_needed, i + 1);
        
        // Print current RSS every 5MB
        if ((i + 1) % 5 == 0) {
            print_memory_usage();
        }
        
        // Small delay to make monitoring easier
        usleep(100000); // 100ms delay between chunks
    }

    if (should_exit) {
        printf("[C-MemEater] Received exit signal during allocation\n");
        cleanup_memory();
        return 0;
    }

    printf("[C-MemEater] Memory allocation complete. Holding %dMB...\n", chunk_count);
    print_memory_usage();

    // Hold memory and wait for termination
    printf("[C-MemEater] Holding memory. Send SIGTERM or SIGINT to exit.\n");
    while (!should_exit) {
        sleep(2);
        printf("[C-MemEater] Still alive, holding %dMB\n", chunk_count);
        print_memory_usage();
    }

    printf("[C-MemEater] Exiting gracefully\n");
    cleanup_memory();
    return 0;
}