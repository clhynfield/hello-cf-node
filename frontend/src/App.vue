<template>
    <div id="app">
        <h1>Hello CF Node</h1>
        <p>Visitor count: {{ info.visitorCount }}</p>
        <p>Instance Index: {{ info.instanceIndex }}</p>
        <p>Last Heartbeat: {{ info.lastUpdate }}</p>
        <p>Worker Threads: {{ info.workerThreads }}</p>
        <p>Memory Used: {{ info.memoryUsed }}</p>
        <p>Memory Free: {{ info.memoryFree }}</p>
        <p>Version: {{ info.version }}</p>
        <button @click="performAction('compute')">Run Compute Task</button>
        <button @click="performAction('leak')">Allocate memory</button>
        <button @click="performAction('clear')">Free memory</button>
    </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from "vue";

export default {
    name: "App",
    setup() {
        const info = ref({});
        let refreshInterval;

        const fetchInfo = async () => {
            try {
                const response = await fetch("/api/info");
                info.value = await response.json();
            } catch (error) {
                console.error("Error fetching info:", error);
            }
        };

        const performAction = async (action) => {
            try {
                await fetch("/api/action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ instanceIndex: 0, action: action }),
                });
                await fetchInfo();
            } catch (error) {
                console.error("Error performing action:", error);
            }
        };

        onMounted(() => {
            fetchInfo(); // Initial fetch
            refreshInterval = setInterval(fetchInfo, 1000); // Refresh every 5 seconds
        });

        onUnmounted(() => {
            clearInterval(refreshInterval); // Clean up the interval when the component is unmounted
        });

        return { info, performAction };
    },
};
</script>
