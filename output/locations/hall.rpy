# [COMFY-START id=hall kind=header]
label location_hall:
# [COMFY-END]

    pass  # obsah lokace

# [COMFY-START id=hall kind=exits]
    menu:
        "south":
            jump location_kitchen
    jump location_hall
# [COMFY-END]
