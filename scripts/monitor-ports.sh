#!/bin/bash

current_ports_file="/tmp/current_ports_$$"
port_stack_file="/tmp/port_stack_$$"
max_stack_size=20

touch "$current_ports_file" "$port_stack_file"

cleanup() {
    rm -f "$current_ports_file" "$port_stack_file"
}
trap cleanup EXIT

print_header() {
    echo "🔍 Port Monitor - Localhost Ports Only"
    echo "======================================"
    echo "Monitoring port changes... Press Ctrl+C to exit"
    echo ""
}

get_current_ports() {
    netstat -an | grep "127.0.0.1.*LISTEN" | awk '{print $4}' | awk -F'[.:]' '{print $NF}' | sort -n
}

log_change() {
    local entry="$1"
    echo "$entry"
}

monitor_ports() {
    while true; do
        local new_ports_list=$(get_current_ports)
        local new_ports_file="/tmp/new_ports_$$"
        echo "$new_ports_list" | tr ' ' '\n' > "$new_ports_file"
        
        # Check for closed ports
        while IFS= read -r port; do
            if [ -n "$port" ] && ! grep -q "^$port$" "$new_ports_file" 2>/dev/null; then
                local timestamp=$(date "+%H:%M:%S")
                log_change "🔴 $timestamp - Port $port CLOSED"
                grep -v "^$port$" "$current_ports_file" > "${current_ports_file}.tmp" 2>/dev/null
                mv "${current_ports_file}.tmp" "$current_ports_file" 2>/dev/null
            fi
        done < "$current_ports_file"
        
        # Check for new ports
        while IFS= read -r port; do
            if [ -n "$port" ] && ! grep -q "^$port$" "$current_ports_file" 2>/dev/null; then
                local timestamp=$(date "+%H:%M:%S")
                local process_info=$(lsof -i :$port -t 2>/dev/null | head -1 | xargs ps -p 2>/dev/null | tail -1 | awk '{for(i=4;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/[[:space:]]*$//')
                if [[ -z "$process_info" ]]; then
                    process_info="Unknown process"
                fi
                log_change "🟢 $timestamp - Port $port OPENED ($process_info)"
                echo "$port" >> "$current_ports_file"
            fi
        done < "$new_ports_file"
        
        cp "$new_ports_file" "$current_ports_file"
        rm -f "$new_ports_file"
        
        sleep 2
    done
}

trap 'echo -e "\n👋 Monitoring stopped."; exit 0' INT

print_header
initial_ports=$(get_current_ports)
initial_count=0
for port in $initial_ports; do
    echo "$port" >> "$current_ports_file"
    initial_count=$((initial_count + 1))
done

if [ $initial_count -gt 0 ]; then
    echo "📊 Found $initial_count active localhost ports"
else
    echo "📊 No active localhost ports found"
fi

echo "🚀 Monitoring started - only showing port changes:"

sleep 2
monitor_ports