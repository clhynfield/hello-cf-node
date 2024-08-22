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
import { ref, onMounted } from "vue";

export default {
    name: "App",
    setup() {
        const info = ref({});

        const fetchInfo = async () => {
            const response = await fetch("/api/info");
            info.value = await response.json();
        };

        const performAction = async (action) => {
            await fetch("/api/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            await fetchInfo();
        };

        onMounted(fetchInfo);

        return { info, performAction };
    },
};
</script>
