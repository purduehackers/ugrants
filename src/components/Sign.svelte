<script lang="ts">
    import { LightningTime } from "@purduehackers/time";
    import { onMount } from "svelte";

    function read() {
        return new LightningTime().convertToLightning(new Date()).colors;
    }

    let colors = $state(read());

    onMount(() => {
        // Spark is the finest unit these colours encode and it advances about
        // once every 21s, so a 10ms interval was doing several thousand times
        // more work than the data changes. 1s stays live without the churn.
        const id = setInterval(() => (colors = read()), 1000);
        return () => clearInterval(id);
    });
</script>

<!-- The one chromatic, moving thing on an otherwise still monochrome page.
     Decorative here: purdue hackers is named and linked in the entry below. -->
<svg
    class="w-full h-full"
    viewBox="0 0 300 300"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
>
    <!-- AI Generated -->
    <rect x="100" y="0" width="100" height="200" fill={colors.zapColor} />
    <rect x="200" y="100" width="100" height="200" fill={colors.sparkColor} />
    <rect x="0" y="200" width="100" height="100" fill={colors.boltColor} />
</svg>
