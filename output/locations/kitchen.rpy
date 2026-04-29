# [COMFY-START id=kitchen kind=header]
label location_kitchen:
# [COMFY-END]

    "Vstupuješ do kuchyně. Voní tu čerstvá káva."
    a "Dobré ráno."

# [COMFY-START id=kitchen kind=exits]
    menu:
        "north":
            jump location_hall
        "outside":
            jump location_garden
    jump location_kitchen
# [COMFY-END]
