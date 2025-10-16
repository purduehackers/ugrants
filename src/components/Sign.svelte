<script lang="ts">
    import { LightningTime } from "@purduehackers/time";
    import { onMount } from "svelte";

    let bottomLeft: SVGRectElement;
    let center: SVGRectElement;
    let right: SVGRectElement;

    onMount(() => {
        setInterval(() => {
            const lt = new LightningTime();
            const time = lt.convertToLightning(new Date());
            const colors = time.colors;

            bottomLeft.setAttribute("style", `fill:${colors.boltColor}`);

            center.setAttribute("style", `fill:${colors.zapColor}`);

            right.setAttribute("style", `fill:${colors.sparkColor}`);
        }, 10);
    });
</script>

<svg
    class="w-full h-full"
    viewBox="0 0 300 300"
    xmlns="http://www.w3.org/2000/svg"
>
    <!-- AI Generated -->
    <rect x="100" y="0" width="100" height="200" bind:this={center} />
    <rect x="200" y="100" width="100" height="200" bind:this={right} />
    <rect x="0" y="200" width="100" height="100" bind:this={bottomLeft} />
</svg>
