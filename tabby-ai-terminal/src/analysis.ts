export interface SuggestedCommand {
    command: string
    reason: string
}

export interface AnalysisResult {
    message: string
    suggestions: SuggestedCommand[]
}

export class AITerminalAnalyzer {
    analyze (question: string, output: string): AnalysisResult {
        const normalizedQuestion = question.toLowerCase()
        const normalizedOutput = output.toLowerCase()
        const suggestions: SuggestedCommand[] = []
        const notes: string[] = []

        const addSuggestion = (command: string, reason: string) => {
            if (!suggestions.some(x => x.command === command)) {
                suggestions.push({ command, reason })
            }
        }

        const addNote = (note: string) => {
            if (!notes.includes(note)) {
                notes.push(note)
            }
        }

        if (normalizedOutput.includes('hostapd') || normalizedOutput.includes('wireless') || normalizedQuestion.includes('wifi')) {
            addNote('The recent output looks related to Wi-Fi or hostapd. Start by checking config and recent AP events.')
            addSuggestion('uci show wireless', 'Inspect OpenWrt wireless config and confirm the expected values.')
            addSuggestion('logread | grep hostapd', 'Focus on hostapd errors, retries, and reconnect events.')
            addSuggestion('wifi reload', 'Re-apply wireless config and confirm whether the issue reproduces.')
        }

        if (normalizedOutput.includes('network') || normalizedOutput.includes('dhcp') || normalizedQuestion.includes('network')) {
            addNote('This looks closer to the network or DHCP layer. Separate interface state, addressing, and upstream service issues first.')
            addSuggestion('ip addr', 'Quickly verify whether interfaces actually have addresses.')
            addSuggestion('ifstatus wan', 'Check WAN state and recent status details.')
            addSuggestion('logread | grep -i dhcp', 'Filter DHCP client or server messages.')
        }

        if (normalizedOutput.includes('permission denied')) {
            addNote('There is a permission denied signal. Check whether this is a user privilege issue or a file permission issue.')
            addSuggestion('whoami', 'Confirm the current shell identity first.')
            addSuggestion('ls -la', 'Inspect file and directory permissions around the target path.')
        }

        if (normalizedOutput.includes('not found') || normalizedOutput.includes('command not found')) {
            addNote('There are signs that a command is missing. Check PATH and whether the expected tools are installed.')
            addSuggestion('echo $PATH', 'Inspect whether common directories are missing from PATH.')
            addSuggestion('which busybox', 'Locate a baseline utility that should exist on many embedded systems.')
        }

        if (!suggestions.length) {
            addNote('I am falling back to a general triage pass: current directory, recent logs, and recent kernel messages.')
            addSuggestion('pwd', 'Confirm the current working directory.')
            addSuggestion('logread | tail -n 100', 'Capture the latest 100 lines of system logs.')
            addSuggestion('dmesg | tail -n 50', 'Check for recent kernel-level errors.')
        }

        if (question.trim()) {
            addNote(`User question included in analysis: "${question.trim()}".`)
        } else {
            addNote('No extra question was provided, so the analysis is based only on recent terminal output.')
        }

        return {
            message: notes.join('\n'),
            suggestions,
        }
    }
}
